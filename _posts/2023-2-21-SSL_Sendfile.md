---
layout: post
title: OpenSSL SSL_sendfile performance with nginx on Linux
---

### Background

[OpenSSL](https://www.openssl.org/)'s implementation of [SSL_sendfile](https://www.openssl.org/docs/man3.1/man3/SSL_sendfile.html) uses [kernel TLS]( to make an encrypted version of the [`sendfile`](https://man7.org/linux/man-pages/man2/sendfile.2.html) system call ) encryption to optimize away user space copying of file data before sending on a socket.

So from:

- `FILE`  -->  `<user-space application>`  -->  `socket` 

to just

- `FILE`  -->  `socket` 

This is sort of an encryption version of the [`sendfile`](https://man7.org/linux/man-pages/man2/sendfile.2.html) system call.

Running `nginx` and `curl`ing

```sh
nginx-1.23.2>strace -f ./objs/nginx -c ./nginx.conf ...
...
[pid 408582] setsockopt(13, SOL_TCP, TCP_ULP, [7564404], 4) = 0
...
[pid 408582] setsockopt(13, SOL_TLS, TLS_TX, "\4\0034\0$F\273F\266\232\"\25M\v\33\257\31\366\252\210Q)>\225\200\216\235\300\341c\300T"..., 56) = 0
[pid 408582] openat(AT_FDCWD, "/home/rmorrison/data/www/rand_1MB.bin", O_RDONLY|O_NONBLOCK) = 14
[pid 408582] newfstatat(14, "", {st_mode=S_IFREG|0664, st_size=1048576, ...}, AT_EMPTY_PATH) = 0
[pid 408582] fadvise64(14, 0, 0, POSIX_FADV_SEQUENTIAL) = 0
[pid 408582] write(3, "HTTP/1.1 200 OK\r\nServer: nginx/1"..., 260) = 260
[pid 408582] sendfile(3, 14, [0] => [1048576], 1048576) = 1048576
[pid 408582] write(5, "127.0.0.1 - - [21/Feb/2023:17:27"..., 112) = 112
[pid 408582] close(14)                  = 0
...
```

See ["Kernel TLS"](https://docs.kernel.org/networking/tls.html) guide to implementing applications with `kTLS`.

 [`sendfile`](https://man7.org/linux/man-pages/man2/sendfile.2.html) has been around for a long time, but Linux kernel support for doing encryption in the kernel was only [added in 2015](https://lwn.net/Articles/665602/).  OpenSSL has opted to only add support for `kTLS` and the `SSL_sendfile` function in their `3.x`+ series of releases, meaning OpenSSL `1.x`+ doesn't currently have support.


#### Kernel Support

First things first, will need a kernel with kTLS support.  "Kernel TLS offload" was [introduced](https://lwn.net/Articles/665602/) in [version 4.13](https://kernelnewbies.org/Linux_4.13#Kernel_TLS_acceleration).  Only some cipher suites are available for use with `kTLS`, and cipher support is somewhat varied by OS/version.

The mainline support for ciphers as of this post seems to be:
[link](https://github.com/torvalds/linux/blob/8bf1a529cd664c8e5268381f1e24fe67aa611dd3/net/tls/tls_main.c#L69)
```c
const struct tls_cipher_size_desc tls_cipher_size_desc[] = {
	CIPHER_SIZE_DESC(TLS_CIPHER_AES_GCM_128),
	CIPHER_SIZE_DESC(TLS_CIPHER_AES_GCM_256),
	CIPHER_SIZE_DESC(TLS_CIPHER_AES_CCM_128),
	CIPHER_SIZE_DESC(TLS_CIPHER_CHACHA20_POLY1305),
	CIPHER_SIZE_DESC(TLS_CIPHER_SM4_GCM),
	CIPHER_SIZE_DESC(TLS_CIPHER_SM4_CCM),
};
...
```

This [post](https://www.nginx.com/blog/improving-nginx-performance-with-kernel-tls/) from the `nginx` team is replete with information on enabling `kTLS` support.

On Linux ensure the `tls` module is loaded with either (as root):
```sh
modprobe tls
```
or add to `/etc/modules` to ensure `mod_tls` is loaded on every boot:
```sh
>cat /etc/modules
# /etc/modules: kernel modules to load at boot time.
#
# This file contains the names of kernel modules that should be loaded
# at boot time, one per line. Lines beginning with "#" are ignored.
tls
```

Can verify after is loaded with `lsmod` command:
```sh
>lsmod | grep tls
tls                   102400  0
```

#### Building OpenSSL

The OpenSSL version I was testing with:
```sh
openssl version
OpenSSL 3.0.8-dev 1 Nov 2022 (Library: OpenSSL 3.0.8-dev 1 Nov 2022)
```

Building OpenSSL with `kTLS` support is _interesting_?   This might be out of date information but [I found it to be true](https://reviews.freebsd.org/rG671a35b176e4b3c445696a8b423db5f8de26c285) that OpenSSL does _not_ enable `kTLS` support by default for their tool chain, and it must be configured with a custom `openssl.cnf` configuration.  Just something to be wary of if using `openssl` commands on the command line (eg. `openssl s_server` with the  `-sendfile`option).  For example to run `s_server` with `kTLS` enabled and using a customer build of OpenSSL:

```sh
OPENSSL_CONF=<custom_openssl.cnf file> \
LD_LIBRARY_PATH=<path to custom openssl> \
openssl s_server \
  -key server.key \
  -cert server.crt \
  -accept 12345 \
  -www \
  -sendfile
```

*NOTE* the `OPENSSL_CONF` and `LD_LIBRARY_PATH` env vars in the command above.

I added the following lines to a generic `openssl.cnf` file:
```diff
+ openssl_conf = my_openssl_conf

+ [ my_openssl_conf ]
+ ssl_conf = my_ssl_conf

+ [ my_ssl_conf ]
+ ktls = my_ktls_conf

+ [ my_ktls_conf ]
+ Options = KTLS
```

This also means a custom OpenSSL library will have to built and linked with `nginx` since by default most versions available on systems will either not have the feature (if OpenSSL version < 3.0.0) or it won't have been enabled by default.

To configure OpenSSL to build with `kTLS` support, (in the OpenSSL repo dir) run:
```sh
openssl>./config -d enable-ktls
```
Can verify after run feature is enabled with:
```sh
openssl>./configdata.pm -o
...
Enabled features:
...
    ktls
...
```

Then build as usual:
```sh
openssl>make -j$(nproc)
...
```

If there's issues with building/configuring/testing `kTLS` support with OpenSSL please see this [GitHub Issue](https://github.com/openssl/openssl/issues/17451) which has lots of troubleshooting advice from OpenSSL dev's and users.  It helped me a lot.

#### Building nginx and enabling

To configure building nginx with a custom built OpenSSL library (in the nginx source tree)
```sh
nginx-1.23.2>./configure \
  --with-http_ssl_module \
  --with-openssl=<path_to_custom_openssl_src_tree> \
  --with-openssl-opt=enable-ktls
```

I wanted pcre and h2 support as well so my specific configure line was:
```sh
nginx-1.23.2>./configure \
  --with-pcre-jit \
  --with-pcre \
  --with-http_v2_module \
  --with-http_ssl_module \
  --with-openssl=/home/rmorrison/archive/openssl \
  --with-openssl-opt=enable-ktls
```

Then just build as usual.

One thing to note [in the nginx code](https://github.com/nginx/nginx/blob/2485681308bd8d3108da31546cb91bb97813a3fb/src/event/ngx_event_openssl.c#L1822) is how nginx tests if `kTLS` is enabled on the socket with the [`BIO_get_ktls_send`](https://www.openssl.org/docs/manmaster/man3/BIO_get_ktls_send.html) function:
```sh
BIO_get_ktls_send() returns 1 if the BIO is using the Kernel TLS data-path for sending. Otherwise, it returns zero. BIO_get_ktls_recv() returns 1 if the BIO is using the Kernel TLS data-path for receiving. Otherwise, it returns zero.
```

To configure the server to enable `SSL_sendfile` with `kTLS` (with an `ssl` listener)
```perl
sendfile on;
ssl_conf_command Options  KTLS;
```

Here's an abridged version of my local test config:
```perl
worker_processes 1;
daemon off;
events {
    worker_connections 1024;
}
http {
    error_log /var/tmp/nginx/error.log error;
    include            mime.types;
    default_type       application/octet-stream;
    sendfile           on;
    read_ahead         1;
    tcp_nopush         on;
    tcp_nodelay        on;
    keepalive_timeout  3600;
    keepalive_requests 10000;
    server {
        listen                    12345 ssl;
        ssl_certificate           /home/rmorrison/data/conf/certs/my_default.crt;
        ssl_certificate_key       /home/rmorrison/data/conf/certs/my_default.key;
        ssl_conf_command Options  KTLS;
        ssl_protocols             TLSv1.2 TLSv1.3;
        server_name               myserver;
        access_log                /var/tmp/nginx/access.log;
        client_body_temp_path     /var/tmp/nginx/client_body_temp;
        proxy_temp_path           /var/tmp/nginx/proxy_temp;
        location / {
            root  /home/rmorrison/data/www/;
            index index.html;
        }
    }
}
```

### Load Testing

Testing over localhost with [hurl](https://github.com/edgio/hurl) on a Xeon Gold Server:
```sh
>cat /proc/cpuinfo | grep 'model name' | uniq
model name	: Intel(R) Xeon(R) Gold 6230R CPU @ 2.10GHz
```

Testing is meant to demonstrate relative performance differences with and without [`SSL_sendfile`](https://www.openssl.org/docs/man3.1/man3/SSL_sendfile.html).

##### Note:

`hurl` is my tool, but I checked with [wrk](https://github.com/wg/wrk) and got similar numbers.  I chose `hurl` so I could tune the number of requests per connection per run.

#### Running

`hurl` was run with:
```sh
hurl 'https://localhost:12345/<resource>' --silent --threads=4 --parallel=4 --seconds=10 --calls=<num_calls>
```
Where the variables were:
- the resource sizes (1kB, 8kB, ...)
- the number of requests (calls) per connection (1, 10, 20, ...)

For example
```sh
hurl 'https://localhost:12345/rand_8kB.bin' --silent --threads=4 --parallel=4 --seconds=10 --calls=10
| RESULTS:             ALL
| fetches:             82047
| max parallel:        4
| bytes:               7.010106e+08
| seconds:             10.00
| mean bytes/conn:     8544.01
| fetches/sec:         8202.24
| bytes/sec:           7.008004e+07
| HTTP response codes: 
| 200 -- 82047
```

![img](https://github.com/tinselcity/tinselcity.github.io/blob/master/images/blog/2023_2_21_SSL_sendfile/requests_s_w_hurl_1kB.svg?raw=true "Requests/s 1kB")

![img](https://github.com/tinselcity/tinselcity.github.io/blob/master/images/blog/2023_2_21_SSL_sendfile/requests_s_w_hurl_8kB.svg?raw=true "Requests/s 8kB")

![img](https://github.com/tinselcity/tinselcity.github.io/blob/master/images/blog/2023_2_21_SSL_sendfile/requests_s_w_hurl_64kB.svg?raw=true "Requests/s 64kB")

![img](https://github.com/tinselcity/tinselcity.github.io/blob/master/images/blog/2023_2_21_SSL_sendfile/requests_s_w_hurl_128kB.svg?raw=true "Requests/s 128kB")

![img](https://github.com/tinselcity/tinselcity.github.io/blob/master/images/blog/2023_2_21_SSL_sendfile/requests_s_w_hurl_1MB.svg?raw=true "Requests/s 1MB")

![img](https://github.com/tinselcity/tinselcity.github.io/blob/master/images/blog/2023_2_21_SSL_sendfile/requests_s_w_hurl_8MB.svg?raw=true "Requests/s 8MB")

![img](https://github.com/tinselcity/tinselcity.github.io/blob/master/images/blog/2023_2_21_SSL_sendfile/requests_s_w_hurl_64MB.svg?raw=true "Requests/s 64MB")


### Summary

The results are mostly what I expected from a `sendfile` like optimization, in that the speed up becomes more pronounced as the time to connect/handshake fades into the background and more time is spent in the symmetric cryptographic sending and receiving of file data.  With larger files (> 1MB) the results can be dramatically better with ~60-70% improved throughput.

What's interesting also is performance of `SSL_sendfile` with smaller files (1-8kB) is a little worse than just `SSL_write`.  I haven't dug into why yet, but might be something to keep track of and maybe avoid if size can be read ahead of serving.


#### References
- Kernel TLS: [https://docs.kernel.org/networking/tls.html](https://docs.kernel.org/networking/tls.html)
- NGINX Blog Post: [https://www.nginx.com/blog/improving-nginx-performance-with-kernel-tls/](https://www.nginx.com/blog/improving-nginx-performance-with-kernel-tls/)
- OpenSSL Issue (~~Closed~~) with detailed enablement help: [https://github.com/openssl/openssl/issues/17451](https://github.com/openssl/openssl/issues/17451)
- Playing with Kernel TLS in Linux 4.13 and Go: [https://words.filippo.io/playing-with-kernel-tls-in-linux-4-13-and-go/](https://words.filippo.io/playing-with-kernel-tls-in-linux-4-13-and-go/)
- load test data: [google sheets](https://docs.google.com/spreadsheets/d/1fJ201NwZCR6coodGlTgkiqPOP9zwA8YUoFYmgGdw7o8)
