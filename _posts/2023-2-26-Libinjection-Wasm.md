---
layout: post
title: libinjection in the browser with wasm
---

[libinjection](https://github.com/libinjection/libinjection) is a small standalone C library for scanning input strings for possible [SQL Injection](https://en.wikipedia.org/wiki/SQL_injection) or [Cross Side Scripting](https://en.wikipedia.org/wiki/Cross-site_scripting) (XSS).  Libraries like libinjection are commonly used with [Web Application Firewalls](https://en.wikipedia.org/wiki/Web_application_firewall) (WAF) for validating/sanitizing client side requests before they encounter server side logic dealing with external/internal resources like database access or server side API calls.


### Compiling wasm

I compiled Libinjection [source](https://github.com/libinjection/libinjection) with [clang](https://clang.llvm.org/) with wasm target (`target=wasm32`).

The compilation line was:

```sh
clang \
  --target=wasm32 \
  --no-standard-libraries \
  -Wl,--export-all -Wl,--no-entry \
  -o libinjection.wasm \
  string.c \
  ./libinjection_html5.c \
  ./libinjection_xss.c \
  ./libinjection_sqli.c
```

I added a few C utilities from `libc` like `memcpy`/`strnlen` etc into a module (`string.c`) for compiling with `--no-stanadard-libraries`.  Other better approaches include linking with [wasi-libc](https://github.com/WebAssembly/wasi-libc) (which include [release assets](https://github.com/WebAssembly/wasi-sdk/releases) for their sdk).  Building generated the [`.wasm` file](https://github.com/tinselcity/tinselcity.github.io/blob/master/dat/blog/2023_2_26_Libinjection_Wasm/libinjection.wasm) for use in the browser application.

There's a lot of great references around the web with `hello world` wasm projects.  I found [this](https://depth-first.com/articles/2019/10/16/compiling-c-to-webassembly-and-running-it-without-emscripten/) one especially helpful.

### Calling from JavaScript

I really need a crash course in JavaScript memory and interoperability with `wasm`.  [Emscripten](https://emscripten.org/) has good utilities for [passing data back and forth](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/Interacting-with-code.html#call-compiled-c-c-code-directly-from-javascript), but since I was embedding this in a single page of html sans third-party libs, I built something more basic.

Converting from a string value retrieved from the DOM to a `UInt8` array for passing to a C function:

```js
function convertFromString(string) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(string)
  const buffer = new Uint8Array(gWasm.instance.exports.memory.buffer, gMemory, bytes.byteLength + 1)
  buffer.set(bytes);
  return buffer
}
```

Where the `gWasm` is WebAssembly module compiled and instantiated from the`libinjection.wasm` WebAssembly file.

```js
  const importObject = {imports: {}};
  (async () => {
    gWasm = await WebAssembly.instantiateStreaming(fetch('libinjection.wasm'), importObject);
  })();
```

The resulting buffer is passed to the C function:

```js
  buffer = convertFromString(document.getElementById("form_field").value);
  xssVal = gWasm.instance.exports.libinjection_xss(buffer.byteOffset, buffer.length);
  xssField = document.getElementById("xss_show_result");
  if (xssVal) {
  ...
```

The entirety of the html/code is embedded in the markdown for [this blog post](https://raw.githubusercontent.com/tinselcity/tinselcity.github.io/master/_posts/2023-2-26-Libinjection-Wasm.md).

---

### Example

In the form below try samples like:

- `default=<script>alert(document.cookie)</script>`
- `user=-1+union+select+1,2,3,(SELECT+user_pass+FROM+wp_users+WHERE+ID=1)`

#### Input
<div>
<input id="form_field" size="64" type="text" onKeyPress="testOnKeyPress()" onKeyUp="testOnKeyPress()">
</div>

<div>
<h4>libinjection version: <span id="version_field"></span></h4>
<h4>XSS Result:       <span id="xss_show_result"></span></h4>
<h4>SQLI Result:      <span id="sqli_show_result"></span></h4>
<h4>SQLI Fingerprint: <span id="sqli_show_fingerprint"></span></h4>
</div>


<script>
// ---------------------------------------------------------
// create shared memory
// ---------------------------------------------------------
const gMemory = new WebAssembly.Memory({
  initial: 1024,
  maximum: 4096,
  shared: true,
});
// ---------------------------------------------------------
// import wasm
// ---------------------------------------------------------
let gWasm;
const importObject = {imports: {}};
(async () => {
  const response = await fetch("{{site.url}}/dat/blog/2023_2_26_Libinjection_Wasm/libinjection.wasm");
  const buffer = await response.arrayBuffer();
  gWasm = await WebAssembly.instantiate(buffer);
  display_version();
})();
// ---------------------------------------------------------
// convert from string
// ---------------------------------------------------------
function convertFromString(string) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(string)
  const buffer = new Uint8Array(gWasm.instance.exports.memory.buffer, gMemory, bytes.byteLength + 1)
  buffer.set(bytes);
  return buffer
}
// ---------------------------------------------------------
// create empty buffer
// ---------------------------------------------------------
function createBuffer(length) {
  const buffer = new Uint8Array(gWasm.instance.exports.memory.buffer, gMemory, length+1)
  return buffer
}
// ---------------------------------------------------------
// key press
// ---------------------------------------------------------
function testOnKeyPress() {
    let buffer = null;
    try {
      fingerprint = createBuffer(8);
      buffer = convertFromString(document.getElementById("form_field").value);
      // ---------------------------------------------------
      // xss test
      // ---------------------------------------------------
      xssVal = gWasm.instance.exports.libinjection_xss(buffer.byteOffset, buffer.length);
      xssField = document.getElementById("xss_show_result");
      if (xssVal) {
        xssField.innerText = "DETECTED";
        xssField.style.color = "red";
      }
      else {
        xssField.innerText = "OK";
        xssField.style.color = "green";
      }
      // ---------------------------------------------------
      // sqli test
      // ---------------------------------------------------
      sqliVal = gWasm.instance.exports.libinjection_sqli(buffer.byteOffset, buffer.length, fingerprint.byteOffset);
      sqliField = document.getElementById("sqli_show_result");
      sqliFingerPrint = document.getElementById("sqli_show_fingerprint");
      if (sqliVal) {
        sqliField.innerText = "DETECTED";
        sqliField.style.color = "red";
        sqliFingerPrint.innerText = fingerprint;
        sqliFingerPrint.style.color = "red";
      }
      else {
        sqliField.innerText = "OK";
        sqliField.style.color = "green";
        sqliFingerPrint.innerText = "NONE";
        sqliFingerPrint.style.color = "green";
      }
    } finally {
      delete buffer;
      delete fingerprint;
    }
}
// ---------------------------------------------------------
// display version
// ---------------------------------------------------------
function display_version() {
  var l_str = new Int8Array(
    gWasm.instance.exports.memory.buffer,
    gWasm.instance.exports.libinjection_version(),
    gWasm.instance.exports.libinjection_version_len()
  )
  let l_version = String.fromCharCode.apply(null, l_str);
  var versionField = document.getElementById("version_field");
  versionField.innerText = l_version;
  versionField.style.color = "blue";
};
</script>

---

### Is this Useful?

_NOPE_!  _Not really_.  It's just a little example of porting a small C library to wasm for use in the browser.  This provides no protection from injection or XSS.  It _could_ be useful for validating strings that could be flagged as potential false positives from WAF's that use libraries like libinjection server-side.


#### References
- libinjection source: [libinjection](https://github.com/libinjection/libinjection)
- WebAssemble.Memory: [https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory)
- Compiling C to WebAssembly and Running It - without Emscripten: [https://depth-first.com/articles/2019/10/16/compiling-c-to-webassembly-and-running-it-without-emscripten/](https://depth-first.com/articles/2019/10/16/compiling-c-to-webassembly-and-running-it-without-emscripten/)
- How to Pass Strings Between JavaScript and WebAssembly: [https://rob-blackbourn.github.io/blog/webassembly/wasm/strings/javascript/c/libc/wasm-libc/clang/2020/06/20/wasm-string-passing.html](https://rob-blackbourn.github.io/blog/webassembly/wasm/strings/javascript/c/libc/wasm-libc/clang/2020/06/20/wasm-string-passing.html)

