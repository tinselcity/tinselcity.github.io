---
layout: post
title: Checking Page Cache State of File on Linux with mincore
---

The Linux syscall `mincore` can be used to "determine whether pages are resident in memory" -according to the [man page](http://man7.org/linux/man-pages/man2/mincore.2.html) _simple enuff :)_.

`mincore() returns a vector that indicates whether pages of the calling process's virtual memory are resident in core (RAM),...`

It's possible to write a little program to check the page cache state of a file with `mincore` by `mmap`ing a file with read-only/shared attributes.

```c
// open a file -get size
int fd = open(file, O_RDONLY);
struct stat file_stat = { 0 };
fstat(fd, &file_stat);
// mmap file
void *map = mmap(NULL, file_stat.st_size, PROT_READ, MAP_SHARED, fd, 0);
// get system page size
const long ps = sysconf(_SC_PAGESIZE);
// create state vector
int vec_size = (file_stat.st_size+ps-1) / ps;
unsigned char *vec = (unsigned char*)malloc(vec_size);
// mincore on the file and printout percentage used
mincore(map, file_stat.st_size, vec);
```

After the mincore call the state vector will contain either: 1 if the page resident in memory or 0 if not resident.

Or more precisely from the man page:

`
On return, the least signif‐icant bit of each byte will be set if the corresponding page is currently resident in memory, and be clear otherwise.
`


A little example using a [test program](https://github.com/tinselcity/experiments/tree/master/mincore)

```sh
# clear the deck -page cache
~>sync; echo 1 > /proc/sys/vm/drop_caches
# file info
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

#### References:

- [mincore man](http://man7.org/linux/man-pages/man2/mincore.2.html)
- [vmtouch -the Virtual Memory Toucher](https://hoytech.com/vmtouch/)
- [attacks on mincore and patches](https://lwn.net/Articles/776801/)
