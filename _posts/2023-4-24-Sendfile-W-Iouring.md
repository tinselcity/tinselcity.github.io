---
layout: post
title: Sendfile with io_uring (almost)
---

Inspired by the [flurry](https://despairlabs.com/blog/posts/2021-06-16-io-uring-is-not-an-event-system/) of [discussions](https://developers.redhat.com/articles/2023/04/12/why-you-should-use-iouring-network-io) around `io_uring` development, I wanted to try writing a basic efficient HTTP file server with [liburing](https://github.com/axboe/liburing), and especially with `sendfile` functionality, since it was ["left as an exercise for the reader"](https://lwn.net/Articles/810491/).

---

### Blocking vs Non-Blocking

In brief (because [no one has ever written a server](https://github.com/search?q=io_uring_submit&type=code) with `io_uring` /s), dealing with I/O is usually synchronous (_blocking_) or asynchronous (_non-blocking_).  ~Blocking from the perspective of the execution context (yielding coroutines notwithstanding).

In a blocking model, the application blocks inline on system calls, halting/waiting for the OS to return requested resources before proceeding.

The psuedo code for a blocking TCP server might look like:

```python
while true:

  # accept connection
  fd = accept(listen.fd, ...

  # read request
  read(fd, ...
  # handle request

  # write response back
  write(fd, ...
```

As opposed to an asynchronous or non-blocking service, which wakes up on events like: "is readable", "is writeable", timed-out etc.  The event based program services requests per event with something like a state machine -picking up where it last left off, before the OS told the program to try again later (`EAGAIN`/`EWOULDBLOCK`).

The general shape of an async TCP server might be:
```python
while true:

  # wait forever for events
  events = select(...)
  for event in events

    if event.type == READABLE:
      if event.fd == listen.fd:
        fd = accept(listen.fd, ...
      else:
        read(event.fd, ...
        # handle request
        # start write response
        write(event.fd,...

    elif event.type == WRITEABLE:
      write(event.fd,...
...  
```

---

### Submission Queues and Completion Queues

![img](https://github.com/tinselcity/tinselcity.github.io/blob/master/images/io_uring.jpg?raw=true "io_uring")
*Source: https://medium.com/nttlabs/rust-async-with-io-uring-db3fa2642dd4*


`io_uring` (and especially [liburing](https://github.com/axboe/liburing)) _feels_ like the asynchronous paradigm, of issuing non-blocking I/O calls, but the key difference being instead of making the calls directly, I/O syscalls are "submitted" to a "queue", and the application can block pending "completion" of these requested syscalls.


A TCP server w/ `io_uring` (liburing) might look like

```python
# prime the pump with a first submission
sqe = io_uring_get_sqe(&ring)
io_uring_prep_accept(sqe, ...
io_uring_submit(ring)

# wait forever for completion queue entries (cqe)
while (io_uring_wait_cqe(&ring, cqe,... 

  if cqe.type == ACCEPT:
    # submit read request
    sqe = io_uring_get_sqe(&ring)
    io_uring_prep_readv(sqe, ...
    io_uring_submit(ring)

    # resubmit accept
    sqe = io_uring_get_sqe(&ring)
    io_uring_prep_accept(sqe, ...
    io_uring_submit(ring)

  if cqe.type == READ:
    # handle request
    # submit write request (for response)
    sqe = io_uring_get_sqe(&ring)
    io_uring_prep_writev(sqe, ...
    io_uring_submit(ring)
  ...

  # mark entry as seen -return for reuse in ring buffer
  io_uring_cqe_seen(&ring, cqe);
```

The application chains submissions, and in some cases resubmits (for `accept`) to the submission queue and waits for any completed/failed calls from the completion queue.

### Splicing w/ `io_uring`

According to [Jens Axboe](https://en.wikipedia.org/wiki/Jens_Axboe) author of both [`splice(2)`](https://man7.org/linux/man-pages/man2/splice.2.html) and `io_uring` (and liburing) with regard to [`sendfile(2)`](https://man7.org/linux/man-pages/man2/sendfile.2.html) support for `io_uring`:

[_"As soon as the splice stuff is integrated, you'll have just that. When I initially wrote splice, at the same time I turned sendfile() into a simple wrapper around it. So if you have splice, you have sendfile as well."_](https://lwn.net/Articles/810491/)

[`splice`](https://en.wikipedia.org/wiki/Splice_(system_call)) "moves data between a file descriptor and a pipe without a round trip to user space".  In order to copy data between a file (file descriptor) and a client connection, we'll need a [`pipe(2)`](https://man7.org/linux/man-pages/man2/pipe.2.html) in between.

The implementation in psuedo code could be:
```sh
# create pipe
pipe(&mypipe)

# splice from file to the "write end of the pipe" [1]
splice(file_fd, mypipe[1], file_size)

# splice from the "read end of the pipe" [0] to client connection
splice(mypipe[0], conn_fd, file_size)
```

I implemented a basic blocking version of this in my code, but it's possible to get non-blocking behavior with splice with the flag `SPLICE_F_NONBLOCK`.  I think this might require `O_NONBLOCK` to be [specified on the pipe descriptors as well](https://groups.google.com/g/fa.linux.kernel/c/MM9TRl0jCcM).

### Coalescing and Chaining

One of the performance advantages from using `io_uring` comes from being able to submit multiple syscalls for a given single `io_uring_enter`, meaning the user application process makes fewer context switches.

For the HTTP file server, I'd like to, in a single submission, send the response headers and kick off the sending of the body data from a file on disk.  The caveat with this approach of submitting multiple calls is that they're [not guaranteed by the API to run in order by default](https://unixism.net/loti/low_level.html#correlating-completions-with-submissions).  _This wouldn't be great in this case to send body data prior to the response headers..._

To enforce ordering between multiple calls set the `IOSQE_IO_LINK` flag in the submission queue entry per entry to [chain submissions together](https://unixism.net/loti/tutorial/link_liburing.html#link-liburing) until the last entry in the chain.

To submit 3 chained calls:

```python
# first submission
sqe = io_uring_get_sqe(ring);
io_uring_prep_xxx(sqe, ...
sqe->flags |= IOSQE_IO_LINK;
...
# second submission
sqe = io_uring_get_sqe(ring);
io_uring_prep_xxx(sqe, ...
sqe->flags |= IOSQE_IO_LINK;
...
# third submission
sqe = io_uring_get_sqe(ring);
io_uring_prep_xxx(sqe, ...
# do NOT set flag here -since end of chain
...
# submit all previous entries
io_uring_submit(ring);
```  

#### Running

Running the file server and `curl` ing:

```sh
# >curl localhost:12345/index.html -v
~/gproj/experiments/hignx>./hignx_uring --debug
hignx_uring.c:main.432: accept(5)
hignx_uring.c:main.611: read(89)
hignx_uring.c:main.478: statx(0)
hignx_uring.c:main.514: open(6)
hignx_uring.c:main.674: send(142)
hignx_uring.c:main.694: splice(361)
hignx_uring.c:main.694: splice(361)
hignx_uring.c:main.611: read(0)
hignx_uring.c:main.714: close(0)
```

---

### Almost but not quite...

It's _almost_ possible to write an HTTP server with `sendfile` behavior using just `io_uring` with the current single exception of `pipe2`, to create a pipe between the file object and the client connection object.

```sh
# stracing server serving client requests
# >curl localhost:12345/index.html
>strace ./hignx_uring
...
io_uring_enter(4, 1, 0, 0, NULL, 8)     = 1
io_uring_enter(4, 1, 0, 0, NULL, 8)     = 1
io_uring_enter(4, 1, 0, 0, NULL, 8)     = 1
io_uring_enter(4, 1, 0, 0, NULL, 8)     = 1
pipe2([58, 59], 0)                      = 0
io_uring_enter(4, 1, 0, 0, NULL, 8)     = 1
io_uring_enter(4, 1, 0, 0, NULL, 8)     = 1
...
io_uring_enter(4, 1, 0, 0, NULL, 8)     = 1
io_uring_enter(4, 1, 0, 0, NULL, 8)     = 1
io_uring_enter(4, 1, 0, 0, NULL, 8)     = 1
pipe2([61, 62], 0)                      = 0
io_uring_enter(4, 1, 0, 0, NULL, 8)     = 1
io_uring_enter(4, 1, 0, 0, NULL, 8)     = 1
...
```

Aside from the direct `pipe2` call, a server written like this could be pretty efficient, and cut down context switching if calls can be coalesced.

Proper high performance usage of `io_uring` (and liburing) appears to still be tricky, especially in the context of [reactors](https://github.com/tinselcity/is2#the-reactor) and using timers/timeouts w/ `io_uring_submit_and_wait_timeout`.

See issues:

- "io_uring" is slower than epoll: [https://github.com/axboe/liburing/issues/189](https://github.com/axboe/liburing/issues/189)
- "Yet another comparison... w/ epoll..." [https://github.com/axboe/liburing/issues/536](https://github.com/axboe/liburing/issues/536)

---

### Future Directions

#### `pipe2`

The HTTP server example above _almost_ avoids calling syscalls directly with the exception of `pipe2` to create the pipe necessary to splice data between the file fd and the client connection fd.  `io_uring` support for creating system IPC resources seems to be on it's way with the recent addition of `IORING_OP_SOCKET` (ie [socket(2)](https://man7.org/linux/man-pages/man2/socket.2.html) support).  So `pipe2` could be [forthcoming](https://lwn.net/Articles/817440/), or better yet even, native `sendfile` support?..

#### `kTLS`

In reality, IPC with anything other than [localhost](https://en.wikipedia.org/wiki/Localhost) would probably require a layer of security, ie [ipsec](https://en.wikipedia.org/wiki/IPsec), [TLS](https://en.wikipedia.org/wiki/Transport_Layer_Security) etc.  In the example of a network proxy or an HTTP file server, to be efficient about copying with fewer context switches, [Kernel TLS Offload](https://docs.kernel.org/networking/tls-offload.html) (`kTLS`) could be used to encrypt/decrypt directly in the kernel.   The [kLoop](https://github.com/fantix/kloop) project is an example of a project using both `io_uring` and `kTLS`

Link to code:
[https://github.com/tinselcity/experiments/blob/master/hignx/hignx_uring.c](https://github.com/tinselcity/experiments/blob/master/hignx/hignx_uring.c)

_Thanks so much to Jacky Yin for their post [clarifying splice usage with io_uring](https://medium.com/@7FrogTW/high-performance-server-static-file-serving-967363685407)_

#### References

- liburing (io_uring library): [https://github.com/axboe/liburing](https://github.com/axboe/liburing)
- liburing docs: [https://unixism.net/loti/tutorial/link_liburing.html](https://unixism.net/loti/tutorial/link_liburing.html)
- `io_uring` is not an event system blog post: [https://despairlabs.com/blog/posts/2021-06-16-io-uring-is-not-an-event-system/](https://despairlabs.com/blog/posts/2021-06-16-io-uring-is-not-an-event-system/)
- RedHat "Why you should user io_uring for network I/O" [https://developers.redhat.com/articles/2023/04/12/why-you-should-use-iouring-network-io](https://developers.redhat.com/articles/2023/04/12/why-you-should-use-iouring-network-io)
- Jacky Yin's post about how to `sendfile` with `splice`: [https://medium.com/@7FrogTW/high-performance-server-static-file-serving-967363685407](https://medium.com/@7FrogTW/high-performance-server-static-file-serving-967363685407)
