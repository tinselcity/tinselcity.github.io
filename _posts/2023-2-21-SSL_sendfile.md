---
layout: post
title: SSL_sendfile performance with nginx
---

### Background


- check kernel support + enable
- build openssl with support
- building nginx with openssl and enable

### Load Testing

Testing with [hurl](https://github.com/edgio/hurl):

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
- NGINX Blog Post: [https://www.nginx.com/blog/improving-nginx-performance-with-kernel-tls/](https://www.nginx.com/blog/improving-nginx-performance-with-kernel-tls/)
- OpenSSL Issue (~~Closed~~) with detailed enablement help: [https://github.com/openssl/openssl/issues/17451](https://github.com/openssl/openssl/issues/17451)
- load test data: [google sheets](https://docs.google.com/spreadsheets/d/1fJ201NwZCR6coodGlTgkiqPOP9zwA8YUoFYmgGdw7o8)
