#!/bin/sh
#findusbdev.sh

ls -lha /dev/tty* 
cat /etc/group
cat /sys/class/tty/ttyUSB0/dev
ls -l -R /dev | grep \"188, *0\" 

./findusbdev.sh

node dist/main.js --device=/dev/ttyUSB0