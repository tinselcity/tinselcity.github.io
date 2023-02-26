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
  gWasm = await WebAssembly.instantiateStreaming(fetch('https://github.com/tinselcity/tinselcity.github.io/blob/master/dat/blog/2023_2_26_Libinjection_Wasm/libinjection.wasm'), importObject);
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
  l_version_field.innerText = "Version: " + l_version;
};
