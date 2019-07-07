---
layout: post
title: Silently dropping tcp connections with TCP_REPAIR
---

Inspired by a [post](https://oroboro.com/dealing-with-network-port-abuse-in-sockets-in-c/) from oroboro.com, here's a test program that will silently close tcp connections -ie closing a client connection from a server process without sending `FIN` or `RST`.

Linux added support for a `TCP_REPAIR` in `setsockopt with kernel version 3.5+ for the pupose supporting live migration of active connections.
To "freeze" the connection state prior to closing:
```c
// ---------------------------------------------------------
// use TCP_REPAIR to "freeze" socket state
// ---------------------------------------------------------
#ifdef TCP_REPAIR
setsockopt(a_fd, SOL_TCP, TCP_REPAIR, &l_opt, sizeof(l_opt));
#endif
```
Testing with a [echo server program](https://github.com/tinselcity/experiments/blob/master/tcp_repair/tcp_repair.c) +`netcat(nc)` and running `tcpdump` in another window:
```sh
# close normally
./tcp_repair 12345 0
# in another term...
>nc localhost 12345
HELLO
HELLO
```
Normally with a std server close:
```sh
sudo tcpdump -i lo 'port 12345'
...
16:20:40.861588 IP localhost.39306 > localhost.12345: Flags [P.], seq 1:7, ack 1, win 342, options [nop,nop,TS val 951609432 ecr 951603381], length 6
16:20:40.861622 IP localhost.12345 > localhost.39306: Flags [.], ack 7, win 342, options [nop,nop,TS val 951609432 ecr 951609432], length 0
16:20:40.861661 IP localhost.12345 > localhost.39306: Flags [P.], seq 1:7, ack 7, win 342, options [nop,nop,TS val 951609432 ecr 951609432], length 6
16:20:40.861686 IP localhost.39306 > localhost.12345: Flags [.], ack 7, win 342, options [nop,nop,TS val 951609432 ecr 951609432], length 0
16:20:40.861725 IP localhost.12345 > localhost.39306: Flags [F.], seq 7, ack 7, win 342, options [nop,nop,TS val 951609432 ecr 951609432], length 0
16:20:40.904773 IP localhost.39306 > localhost.12345: Flags [.], ack 8, win 342, options [nop,nop,TS val 951609476 ecr 951609432], length 0
```
Calling TCP_REPAIR to "freeze" the connection state prior to closing the client socket from the server:
Running TCP_REPAIR requires the process be `suitably privileged` -thus the `sudo ...`
```sh
# freeze before close
sudo ./tcp_repair 12345 1
# in another term...
>nc localhost 12345
HELLO
HELLO
```
```sh
16:22:42.235345 IP localhost.39312 > localhost.12345: Flags [P.], seq 1:7, ack 1, win 342, options [nop,nop,TS val 951730806 ecr 951724587], length 6
16:22:42.235370 IP localhost.12345 > localhost.39312: Flags [.], ack 7, win 342, options [nop,nop,TS val 951730806 ecr 951730806], length 0
16:22:42.235398 IP localhost.12345 > localhost.39312: Flags [P.], seq 1:7, ack 7, win 342, options [nop,nop,TS val 951730806 ecr 951730806], length 6
16:22:42.235411 IP localhost.39312 > localhost.12345: Flags [.], ack 7, win 342, options [nop,nop,TS val 951730806 ecr 951730806], length 0
```
Note the lack of a server->client`FIN` message in the latter example 
The potential idea here being, it may be possible to exhaust client system resources like number of open file descriptors -if it's possible to leave the tcp connections half-open.
references:
1. [TCP connection repair](https://lwn.net/Articles/495304/)
2. [Dealing with Network Port Abuse in Sockets in C++](https://oroboro.com/dealing-with-network-port-abuse-in-sockets-in-c/)
