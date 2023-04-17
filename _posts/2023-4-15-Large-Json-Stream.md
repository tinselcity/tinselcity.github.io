---
layout: post
title: Reading large JSON files with memory constraints
---

SUMMARY (TODO)

A basic reader in RapidJSON could look like:
```cpp
#define FATAL(...) do { fprintf(stderr, __VA_ARGS__); return -1;} while(0)
int main(int argc, char **argv) {
  FILE* fp = fopen(argv[1], "rb");
  if (fp == nullptr) {
    FATAL("error opening file: %s. Reason: %s\n",
      argv[1], strerror(errno));
  }
  char rbuf[65536];
  rapidjson::FileReadStream is(fp, rbuf, sizeof(rbuf));
  rapidjson::Document js;
  rapidjson::ParseResult ok = js.ParseStream(is);
  if (!ok) {
    FATAL("error parsing json. Reason[%d]: %s\n",
      (int)ok.Offset(), rapidjson::GetParseError_En(ok.Code()));
  }
  double num_cust = 0;
  double avg_balance = 0.0;
  for (auto && obj : js.GetObject()){
    if (std::string(obj.name.GetString()) != "customers") { continue;}
    for (auto && cust : obj.value.GetArray()) {
      for (auto && prop : cust.GetObject()) {
        if (std::string(prop.name.GetString()) == "balance") {
          ++num_cust;
          double balance = (double)(prop.value.GetInt());
          avg_balance = avg_balance + ((balance - avg_balance) / num_cust);
        }
      }
    }
  }
  fclose(fp);
  printf("average balance: %.2f\n", avg_balance);
  return 0;
}
```

### Running with Memory Constraints

On Linux systems with systemd support, [`systemd-run`](https://manpages.ubuntu.com/manpages/jammy/man1/systemd-run.1.html) is a one-shot command for running a command in "transient scope/service" units.

To limit the memory of a command:
```sh
systemd-run --user -t -G --wait -p MemoryMax=<max> <cmd+args>
```

Constraining the limit of the command to read all of the json at once shows the process was unsuccessful due to [`oom-kill`](https://www.kernel.org/doc/gorman/html/understand/understand016.html):

```sh
>systemd-run --user -t -G --wait -p MemoryMax=64M /tmp/read_json /tmp/big.json
Running as unit: run-u8357.service
Press ^] three times within 1s to disconnect TTY.
Finished with result: oom-kill
Main processes terminated with: code=killed/status=KILL
Service runtime: 5.124s
CPU time consumed: 5.084s
```

### Streaming w/ RapidJSON

Instead of pulling the entire file into memory, use [`mmap`](https://man7.org/linux/man-pages/man2/mmap.2.html), and stream the data through a library that supports streaming.

```cpp
int main(int argc, char **argv) {
  char* buf = nullptr;
  size_t buf_len = 0;
  if (mmap_file(argv[1], &buf, buf_len) != 0) {
    return -1;
  }
  rapidjson::StringStream ss(buf);
  jshandler handler;
  rapidjson::Reader reader;
  rapidjson::ParseResult ok = reader.Parse(ss, handler);
  if (!ok) {
    FATAL("error parsing json. Reason[%d]: %s\n", (int)ok.Offset(), rapidjson::GetParseError_En(ok.Code()));
  }  
  printf("average balance: %.2f\n", handler.avg_balance);
  munmap(buf, buf_len);
  return 0;
}
```

This isn't a robust approach, but the reader can perform aggregations based on filters or keys.  In this case searching for `"balance"` fields in individual objects.

```cpp
struct jshandler {
  bool Int(int i) { avg_more((int)i); return true; }
  bool Uint(unsigned u) { avg_more((int)u); return true; }
  // mapping key balance -> avg calculation
  bool Key(const char* str, rapidjson::SizeType length, bool copy) {
    if (std::string(str, length) == "balance") {
      balance_flag = true;
    }
    return true;
  }
  // recalc mean and unset balance flag
  void avg_more(int val) {
    ++num_cust;
    avg_balance = avg_balance + ((val- avg_balance) / num_cust);
    balance_flag = false;
  }
  bool balance_flag;
  double num_cust;
  double avg_balance;
};
``` 

#### Results

Running the streaming version of the JSON reader w/ memory limits:
```sh
>systemd-run --user -t -G --wait -p MemoryMax=64M /tmp/read_json_stream /tmp/big.json
Running as unit: run-u8358.service
Press ^] three times within 1s to disconnect TTY.
average balance: 494901.69
Finished with result: success
Main processes terminated with: code=exited/status=0
Service runtime: 3.352s
CPU time consumed: 3.344s
```

Just as a sanity check verifying results against std reader w/o memory limits:
```sh
>./read_json /tmp/big.json 
average balance: 494901.69
```

Links to code:
[https://github.com/tinselcity/experiments/tree/master/big_json](https://github.com/tinselcity/experiments/tree/master/big_json)

### Notes

#### Throughput
This post was more about dealing with memory constraints than performance, but in my anecdotal testing I found [simdjson](https://github.com/simdjson/simdjson) to parse 4-10x faster than [RapidJSON](https://rapidjson.org/).  [simdjson](https://github.com/simdjson/simdjson) appears to support streaming an object as well as a [stream of records](https://github.com/simdjson/simdjson/blob/master/doc/basics.md#newline-delimited-json-ndjson-and-json-lines).

#### Largest Object
Both simdjson and RapidJSON appear to have 4GB single object/file [constraints](https://github.com/simdjson/simdjson/issues/128#issuecomment-1172576669/), although RapidJSON could be customized to support larger sizes [according to the author](https://github.com/Tencent/rapidjson/issues/1511#issuecomment-490736496).

#### References

- RapidJSON: [https://rapidjson.org](https://rapidjson.org/)
- simdjson: [https://github.com/simdjson/simdjson](https://github.com/simdjson/simdjson)
- Linux Control Group v2: [https://docs.kernel.org/admin-guide/cgroup-v2.html](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- Linux Page Cache Tutorial: [https://biriukov.dev/docs/page-cache/6-cgroup-v2-and-page-cache/](https://biriukov.dev/docs/page-cache/6-cgroup-v2-and-page-cache/)

