---
layout: post
title: libinjection in the browser with wasm
---

[libinjection](https://github.com/libinjection/libinjection) is a small standalone C library for scanning input strings for possible [SQL Injection](https://en.wikipedia.org/wiki/SQL_injection) or [Cross Side Scripting](https://en.wikipedia.org/wiki/Cross-site_scripting) (XSS).  Libraries like libinjection are commonly used with [Web Application Firewalls](https://en.wikipedia.org/wiki/Web_application_firewall) (WAF) for validating/sanitizing client side requests before they encounter server side logic dealing with external/internal resources like database access or server side API calls.


#### References
- libinjection source: [libinjection](https://github.com/libinjection/libinjection)
- WebAssemble.Memory: [https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory)
- Compiling C to WebAssembly and Running It - without Emscripten: [https://depth-first.com/articles/2019/10/16/compiling-c-to-webassembly-and-running-it-without-emscripten/](https://depth-first.com/articles/2019/10/16/compiling-c-to-webassembly-and-running-it-without-emscripten/)
- How to Pass Strings Between JavaScript and WebAssembly: [https://rob-blackbourn.github.io/blog/webassembly/wasm/strings/javascript/c/libc/wasm-libc/clang/2020/06/20/wasm-string-passing.html](https://rob-blackbourn.github.io/blog/webassembly/wasm/strings/javascript/c/libc/wasm-libc/clang/2020/06/20/wasm-string-passing.html)


### Example

In the form below try samples like:

- `default=<script>alert(document.cookie)</script>`
- `user=-1+union+select+1,2,3,4,5,6,7,8,9,(SELECT+user_pass+FROM+wp_users+WHERE+ID=1)`

#### Testing
<h3 id="version_field">libinjection version: ???</h3>
<input id="form_field" type="text" onKeyPress="testOnKeyPress()" onKeyUp="testOnKeyPress()"><br>
<h3>XSS Result:       <span id="xss_show_result"></span></h3>
<h3>SQLI Result:      <span id="sqli_show_result"></span></h3>
<h3>SQLI Fingerprint: <span id="sqli_show_fingerprint"></h3>
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
      if (xssVal) {
        document.getElementById("xss_show_result").innerText = "INJECTION";
      }
      else {
        document.getElementById("xss_show_result").innerText = "OK";
      }
      // ---------------------------------------------------
      // sqli test
      // ---------------------------------------------------
      sqliVal = gWasm.instance.exports.libinjection_sqli(buffer.byteOffset, buffer.length, fingerprint.byteOffset);
      if (sqliVal) {
        document.getElementById("sqli_show_result").innerText = "INJECTION";
        document.getElementById("sqli_show_fingerprint").innerText = fingerprint;
      }
      else {
        document.getElementById("sqli_show_result").innerText = "OK";
        document.getElementById("sqli_show_fingerprint").innerText = "NONE";
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
  var l_version_field = document.getElementById("version_field");
  l_version_field.innerText = "libinjection version: " + l_version;
};
</script>
