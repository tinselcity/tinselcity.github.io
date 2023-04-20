---
layout: post
title: IPC with file backed mutexes
---

A lesser known use of glibc pthread mutexes is to make them file backed and “share” them for purposes of IPC, ie synchronization across not only between threads in a process, but across processes.  The pre-agreement is, as usual, a file path.

The steps to create a shared mutex are to: open file at path, pre-allocate/mmap region into memory, and then initialize/specialize mutex (in attributes) as `PTHREAD_PROCESS_SHARED`.

#### Create Shared Mutex

```c
int create_mutex(pthread_mutex_t **mutex) {
    // Open file to back mutex object
    int mmap_fd = mmap_fd = open(MY_COOL_MUTEX_FILE,
      O_RDWR | O_CREAT,
      0666);
    // Allocate and map into memory
    posix_fallocate(mmap_fd, 0, sizeof(pthread_mutex_t));
    *mutex = mmap(NULL,
      sizeof(pthread_mutex_t),
      PROT_READ | PROT_WRITE, MAP_SHARED,
      mmap_fd,
      0);
    // Specialize mutex attributes for "shared" mutex
    pthread_mutexattr_t mutex_attr;
    pthread_mutexattr_init(&mutex_attr);
    pthread_mutexattr_setpshared(&mutex_attr,
      PTHREAD_PROCESS_SHARED);
    pthread_mutex_init(*mutex, &mutex_attr);
    return 0;
}
```

#### Open Shared Mutex
 
```c
int open_mutex(pthread_mutex_t **mutex) {
    // Open file to back mutex object
    int mmap_fd = mmap_fd = open(MY_COOL_MUTEX_FILE, O_RDWR);
    *mutex = mmap(NULL,
      sizeof(pthread_mutex_t),
      PROT_READ | PROT_WRITE, MAP_SHARED,
      mmap_fd,
      0);
    return 0;
}
```

Now the mutex can be used between processes -take care to be wary of order of operations (ie create before use).

[Link to examples](https://github.com/tinselcity/experiments/tree/master/ipc_mutex).

#### References

- [Creating IPC Semaphores using mutex/condition variables](https://linux.die.net/man/3/pthread_mutexattr_init) _(pthread_mutex_attr_init man page)_
