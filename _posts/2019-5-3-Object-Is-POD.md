---
layout: post
title: Checking object is POD
---

A [coworker](https://twitter.com/daveisangry) showed me a neat trick to check at compile time whether a class/struct was POD.  `va_arg` does not allow non-POD arguments to be passed in.  He wrote a little compile time check that could be embedded in functions or even the class/struct declarations themselves.  This is not portable -it’s worked in g++ 4.6.3 on my linux box, but does not work in VC++ (MSVC++ apparently is quite happy to pass non-POD objects through va_arg.

The `if(0)` ought to compile out -w/ any optimization level

```cpp
// Includes
#include <stdarg.h>
  
// Define the macro to ensure a class is POD
inline int check_for_pod(int count, ...)
{
    va_list ap;
    va_start(ap, count);
    va_end(ap);
    return 0;
};
  
#define CHECK_FOR_POD(_class) \
    if(0){ \
        _class var; \
        check_for_pod(1, var); \
    }

```

Compiling a little example like this:

```cpp
#include <string>
#include "check_for_pod.h"
  
// Types...
class my_cool_pod_class {
    int a;
    int b;
    int c;
};
  
class my_cool_non_pod_class {
    int a;
    int b;
    int c;
    std::string str;
};
  
// Main...
int main(void)
{
    CHECK_FOR_POD(my_cool_pod_class);
    CHECK_FOR_POD(my_cool_non_pod_class);
    return 0;
}
```

Compiling gives:


```sh
experiments/check_for_pod/src>g++ check_for_pod.cpp
check_for_pod.cpp: In function ‘int main()’:
check_for_pod.cpp:46:5: error: cannot pass objects of non-trivially-copyable type ‘class my_cool_non_pod_class’ through ‘...’
```

[Link to examples](https://github.com/tinselcity/experiments/tree/master/check_for_pod)

#### References

- [POD Types in C++11 (StackOverflow)](https://stackoverflow.com/questions/4178175/what-are-aggregates-and-pods-and-how-why-are-they-special/7189821#7189821)
