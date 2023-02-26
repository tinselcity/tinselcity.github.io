---
layout: post
title: libinjection in the browser with wasm
customjs:
 - https://github.com/tinselcity/tinselcity.github.io/blob/master/dat/blog/2023_2_26_Libinjection_Wasm/libinjection.js

---

[libinjection](https://github.com/libinjection/libinjection) is a small standalone C library for scanning input strings for possible [SQL Injection](https://en.wikipedia.org/wiki/SQL_injection) or [Cross Side Scripting](https://en.wikipedia.org/wiki/Cross-site_scripting) (XSS).  Libraries like libinjection are commonly used with [Web Application Firewalls](https://en.wikipedia.org/wiki/Web_application_firewall) (WAF) for validating/sanitizing client side requests before they encounter server side logic dealing with external/internal resources like database access or server side API calls.


#### References
- libinjection source: [libinjection](https://github.com/libinjection/libinjection)
- WebAssemble.Memory: [https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory)
- Compiling C to WebAssembly and Running It - without Emscripten: [https://depth-first.com/articles/2019/10/16/compiling-c-to-webassembly-and-running-it-without-emscripten/](https://depth-first.com/articles/2019/10/16/compiling-c-to-webassembly-and-running-it-without-emscripten/)
- How to Pass Strings Between JavaScript and WebAssembly: [https://rob-blackbourn.github.io/blog/webassembly/wasm/strings/javascript/c/libc/wasm-libc/clang/2020/06/20/wasm-string-passing.html](https://rob-blackbourn.github.io/blog/webassembly/wasm/strings/javascript/c/libc/wasm-libc/clang/2020/06/20/wasm-string-passing.html)
