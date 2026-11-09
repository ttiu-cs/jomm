#!/bin/bash
# sheet.sh <video> <out.jpg> <cols> t1 t2 ... : contact sheet with timestamps
v=$1; o=$2; c=$3; shift 3; d=$(mktemp -d); i=0
for t in "$@"; do ffmpeg -v error -y -ss $t -i $v -frames:v 1 -vf "scale=-2:360,drawtext=text='$t':x=8:y=8:fontsize=28:fontcolor=white:box=1:boxcolor=black" $d/$(printf %03d $i).jpg; i=$((i+1)); done
ffmpeg -v error -y -pattern_type glob -i "$d/*.jpg" -vf tile=${c}x$(( (i+c-1)/c )) $o; rm -rf $d
