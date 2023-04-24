---
layout: post
title: Sendfile with io_uring (almost)
---

Inspired by the [flurry](https://despairlabs.com/blog/posts/2021-06-16-io-uring-is-not-an-event-system/) of [discussions](https://developers.redhat.com/articles/2023/04/12/why-you-should-use-iouring-network-io) around `io_uring` development, I wanted to try writing a basic efficient HTTP file server with [liburing](https://github.com/axboe/liburing), and especially with `sendfile` functionality, since it was ["left as an exercise for the reader"](https://lwn.net/Articles/810491/).

### Submission Queue's / Completion Queue's

In brief (because [no one has ever written a server](https://github.com/search?q=io_uring_submit) with `io_uring` /s), dealing with I/O is usually synchronous (_blocking_) or asynchronous (_non-blocking_).  ~Blocking from the perspective of the execution context (yielding coroutines non-withstanding).

In a blocking model, the application blocks, waiting for the OS to return requested resources before proceeding.

```python
# accept connection
int fd = accept(...
# read request
read(fd, ...
# handle request
<parse request...>
# write response
write(response...
```

With asynchronous programs, the program waits for activity, and handles state.

```python
# wait forever for events
while events = select(... >= 0)
  for event in events
    if event.type == READ:
      read(event.fd, ...
    elif event.type == WRITE:
      write(event.fd,...
...  
```

`io_uring` (and especially [liburing](https://github.com/axboe/liburing)) _feel_ like the asynchronous paradigm, of issuing non-blocking I/O calls, but the key difference being instead of making the calls directly, I/O syscalls are "submitted" to a "queue", and the application can block pending "completion" of these requested syscalls. 

![img](https://github.com/tinselcity/tinselcity.github.io/blob/master/images/io_uring.jpg?raw=true "io_uring")
*Source: https://medium.com/nttlabs/rust-async-with-io-uring-db3fa2642dd4*

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
    <handle read request data>
    # submit write request
    sqe = io_uring_get_sqe(&ring)
    io_uring_prep_writev(sqe, ...
    io_uring_submit(ring)
  ...
```

The application chains submissions, and in some cases resubmits (for `accept` to the "submission" queue and waits for any completed/failed calls from the "completion queue".

### Splicing w/ `io_uring`

TODO

### Future Directions

#### `pipe2`

The HTTP server example above _almost_ avoids calling syscalls directly with the exception of `pipe2` to create the pipe necessary to splice data between the file fd and the client connection fd.  `io_uring` support for creating system IPC resources seems to be on it's way with the recent addition of `IORING_OP_SOCKET` (ie [socket(2)](https://man7.org/linux/man-pages/man2/socket.2.html) support).  So `pipe2` could be [forthcoming](https://lwn.net/Articles/817440/), or better yet even, native `sendfile` support?..

#### `kTLS`

In reality, IPC with anything other than [localhost](https://en.wikipedia.org/wiki/Localhost) would probably require a layer of security, ie [ipsec](https://en.wikipedia.org/wiki/IPsec), [TLS](https://en.wikipedia.org/wiki/Transport_Layer_Security) etc.  In the example of an network proxy or an HTTP file server, to be efficient about copying with fewer context switches, [Kernel TLS Offload](https://docs.kernel.org/networking/tls-offload.html) (`kTLS`) could be used to encrypt/decrypt directly in the kernel.   The [kLoop](https://github.com/fantix/kloop) project is an example of a project using both `io_uring` and `kTLS`

Link to code:
[https://github.com/tinselcity/hignx/blob/main/hignx_uring.c](https://github.com/tinselcity/hignx/blob/main/hignx_uring.c)

#### References

- liburing (io_uring library): [https://github.com/axboe/liburing](https://github.com/axboe/liburing)
- liburing docs: [https://unixism.net/loti/tutorial/link_liburing.html](https://unixism.net/loti/tutorial/link_liburing.html)
- `io_uring` is not an event system blog post: [https://despairlabs.com/blog/posts/2021-06-16-io-uring-is-not-an-event-system/](https://despairlabs.com/blog/posts/2021-06-16-io-uring-is-not-an-event-system/)
- RedHat "Why you should user io_uring for network I/O" [https://developers.redhat.com/articles/2023/04/12/why-you-should-use-iouring-network-io](https://developers.redhat.com/articles/2023/04/12/why-you-should-use-iouring-network-io)
- Jacky Yin's post about how to `sendfile` with `splice`: [https://medium.com/@7FrogTW/high-performance-server-static-file-serving-967363685407](https://medium.com/@7FrogTW/high-performance-server-static-file-serving-967363685407)
