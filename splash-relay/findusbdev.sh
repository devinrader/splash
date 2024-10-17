#!/bin/sh
#findusbdev.sh

echo $1

if [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
  echo "Find which USB devices are associated with which /dev/ nodes     
  Usage:                                                                 
    $0 [-h|--help] [searchString]                                        
                                                                        
    -h | --help   Prints this message                                    
    searchString  Print only /dev/<device> of matching output            
                  With no arguments $0 prints information for all        
                  possible USB device nodes                              
                                                                        
  E.g. $0 \"FTDI_FT232\" - will show /dev/ttyUSBX for a device using     
  the FTDI FT232 chipset.                                                
  "                                                                      
  exit 0                                                             
fi  

devs=$(
for sysdevpath in $(find /sys/bus/usb/devices/usb*/ -name dev ); do
  (
    echo $sysdevpath;
    syspath="${sysdevpath%/dev}"
    devname="$(udevadm info -q name -p "$syspath")"
    case "$devname" in
      "bus/"*)
        exit 
        ;;
    esac
    eval "$(udevadm info -q property --export -p "$syspath")"
    [[ -z "$ID_SERIAL" ]] && exit                              
    echo "/dev/$devname - $ID_SERIAL"
  )
  done
  wait
)
                                                                   
devs=$(echo "$devs" | sort)

if [ -z "$1" ]; then                                                   
  echo "${devs}"                                                     
else                                                                   
  echo "${devs}" | grep "$1" | awk '{print $1}'                      
fi 

#devs=$(                                                         
#     syspath="${sysdevpath%/dev}"
#     devname="$(udevadm info -q name -p "$syspath")"
#     case "$devname" in
#       "bus/"*)
#         exit 
#         ;;
#     esac
#     eval "$(udevadm info -q property --export -p "$syspath")"
#     [[ -z "$ID_SERIAL" ]] && exit                              
#     echo "/dev/$devname - $ID_SERIAL"
#   done
#   wait
# )

# devs=$(echo "$devs" | sort)
                                                                       
# if [ -z "$1" ]; then                                                   
#   echo "${devs}"                                                     
# else                                                                   
#   echo "${devs}" | grep "$1" | awk '{print $1}'                      
# fi      