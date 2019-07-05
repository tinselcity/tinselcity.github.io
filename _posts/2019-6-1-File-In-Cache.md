---
layout: post
title: Checking File in Page Cache'd with `mincore` on Linux
---

The Linux syscall `mincore` can be used to "determine whether pages are resident in memory" -according to the [man page](http://man7.org/linux/man-pages/man2/mincore.2.html) _simple enuff :)_.

```
mincore() returns a vector that indicates whether pages of the calling process's virtual memory are resident in core (RAM), and  so  will  not cause  a  disk  access  (page fault) if referenced.  The kernel returns residency information about the pages starting at the address addr, and continuing for length bytes.
```

It's possible to write a little program to check the page cache state of a file with `mincore` by `mmap`ing a file with read-only/shared attributes.

```c
...
// -------------------------------------------------
// open a file -get size
// -------------------------------------------------
int l_fd = open(l_file, O_RDONLY);
struct stat l_stat = { 0 };
fstat(l_fd, &l_stat);
// -------------------------------------------------
// mmap file
// -------------------------------------------------
void *l_map = mmap(NULL, l_stat.st_size, PROT_READ, MAP_SHARED, l_fd, 0);
// -------------------------------------------------
// get system page size
// create state vector
// -------------------------------------------------
const long l_ps = sysconf(_SC_PAGESIZE);
int l_vec_size = (l_stat.st_size+l_ps-1) / l_ps;
unsigned char *l_vec = (unsigned char*)malloc(l_vec_size);
// -------------------------------------------------
// mincore on the file and printout percentage used
// -------------------------------------------------
l_s = mincore(l_map, l_stat.st_size, l_vec);
...
```

After the mincore call the state vector will contain either: 1 if the page resident in memory or 0 if not resident.

Or more precisely from the man page:
```
On return, the least signif‐icant bit of each byte will be set if the corresponding page is currently resident in memory, and be clear otherwise.
```

A little example using a [test program](https://github.com/tinselcity/experiments/tree/master/mincore)

```sh
# clear the deck -page cache
~# sync; echo 1 > /proc/sys/vm/drop_caches
~>ls -al /tmp/nasa.xml 
-rw-rw-r-- 1 user user 25050431 Mar 29  2018 /tmp/nasa.xml
# get current state of page cache for file...
~>./file_in_page_cache /tmp/nasa.xml 
file: /tmp/nasa.xml is 0.00% in page cache
# dd out a bit
~>dd if=/tmp/nasa.xml count=5120 bs=1024 of=/dev/null
5120+0 records in
5120+0 records out
5242880 bytes (5.2 MB, 5.0 MiB) copied, 0.0769642 s, 68.1 MB/s
# check page cache state again...
~>./file_in_page_cache /tmp/nasa.xml 
file: /tmp/nasa.xml is 21.91% in page cache
```

references:
1. [mincore man](http://man7.org/linux/man-pages/man2/mincore.2.html)
2. [vmtouch -the Virtual Memory Toucher](https://hoytech.com/vmtouch/)
3. [attacks on mincore and patches](https://lwn.net/Articles/776801/)



