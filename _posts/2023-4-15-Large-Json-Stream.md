---
layout: post
title: streaming large json files with memory constraints
---

SUMMARY


### Streaming w/ rapidjson

TODO


### Running with Memory Constraints

TODO

### Notes

#### Throughput
This post was more about dealing with memory constraints than performance, but in my anecdotal testing I found [simdjson](https://github.com/simdjson/simdjson) to parse 4-10x faster than [RapidJSON](https://rapidjson.org/).  [simdjson](https://github.com/simdjson/simdjson) appears to support streaming an object as well as a [stream of records](https://github.com/simdjson/simdjson/blob/master/doc/basics.md#newline-delimited-json-ndjson-and-json-lines).

#### Largest Object
Both simdjson and RapidJSON appear to have 4GB single object/file [constraints](https://github.com/simdjson/simdjson/issues/128#issuecomment-1172576669/), although RapidJSON could be customized to support larger sizes [according to the author](https://github.com/Tencent/rapidjson/issues/1511#issuecomment-490736496).

#### References

- Control Group v2: [https://docs.kernel.org/admin-guide/cgroup-v2.html](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- rapidjson: [https://rapidjson.org/](https://rapidjson.org/)

