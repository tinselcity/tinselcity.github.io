---
layout: post
title: OpenSSL SSL_sendfile performance with nginx on Linux
---

### Background

Without doing too much code spelunking [OpenSSL](https://www.openssl.org/)'s implementation of [SSL_sendfile](https://www.openssl.org/docs/man3.1/man3/SSL_sendfile.html) appears to use the [`sendfile`](https://man7.org/linux/man-pages/man2/sendfile.2.html) system call to optimize away user space copying of:

- `FILE`-->`<user-space application>`-->`socket` 

to just

- `FILE`-->`socket` 

Running `nginx` and `curl`ing

```sh
nginx-1.23.2>strace -f ./objs/nginx -c ./nginx.conf ...
[pid 349910] openat(AT_FDCWD, "/home/rmorrison/data/www/rand_64MB.bin", O_RDONLY|O_NONBLOCK) = 11
[pid 349910] newfstatat(11, "", {st_mode=S_IFREG|0664, st_size=67108864, ...}, AT_EMPTY_PATH) = 0
[pid 349910] fadvise64(11, 0, 0, POSIX_FADV_SEQUENTIAL) = 0
[pid 349910] write(3, "HTTP/1.1 200 OK\r\nServer: nginx/1"..., 262) = 262
[pid 349910] sendfile(3, 11, [0] => [2097152], 2097152) = 2097152
[pid 349910] epoll_wait(9, [], 512, 0)  = 0
[pid 349910] sendfile(3, 11, [2097152] => [4194304], 2097152) = 2097152
[pid 349910] epoll_wait(9, [], 512, 0)  = 0
[pid 349910] sendfile(3, 11, [4194304] => [6291456], 2097152) = 2097152
[pid 349910] epoll_wait(9, [], 512, 0)  = 0
...
```

 [`sendfile`](https://man7.org/linux/man-pages/man2/sendfile.2.html) has been around for a long time, but Linux kernel support for encrypted `sendfile` behavior was only [added in 2015](https://lwn.net/Articles/665602/).  OpenSSL has opted to only add support for `kTLS` and the `SSL_sendfile` function in their `3.x`+ series of releases, meaning OpenSSL 1.x doesn't currently support it.


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

Building OpenSSL with `kTLS` support is _interesting_?   This might be out of date information but [I found it to be true](https://reviews.freebsd.org/rG671a35b176e4b3c445696a8b423db5f8de26c285) that OpenSSL does _not_ enable `kTLS` support by default, and it must be configured with a custom `openssl.cnf` configuration.

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

#### Building nginx and enabling

- building nginx with openssl and enable



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
TODO

#### References
- Kernel TLS: [https://docs.kernel.org/networking/tls.html](https://docs.kernel.org/networking/tls.html)
- NGINX Blog Post: [https://www.nginx.com/blog/improving-nginx-performance-with-kernel-tls/](https://www.nginx.com/blog/improving-nginx-performance-with-kernel-tls/)
- OpenSSL Issue (~~Closed~~) with detailed enablement help: [https://github.com/openssl/openssl/issues/17451](https://github.com/openssl/openssl/issues/17451)
- Playing with Kernel TLS in Linux 4.13 and Go: [https://words.filippo.io/playing-with-kernel-tls-in-linux-4-13-and-go/](https://words.filippo.io/playing-with-kernel-tls-in-linux-4-13-and-go/)
- load test data: [google sheets](https://docs.google.com/spreadsheets/d/1fJ201NwZCR6coodGlTgkiqPOP9zwA8YUoFYmgGdw7o8)
