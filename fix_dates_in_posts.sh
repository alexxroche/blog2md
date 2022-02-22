#!/bin/sh
# fix_dates_in_posts.sh ver. 20220221212507 Copyright 2022 alexx, MIT License
# RDFa:deps="[sed]"
usage(){ echo "Usage: $(basename $0) [-h]\n\t -h This help message"; exit 0;}
[ "$1" ]&& echo "$1"|grep -q '\-h' && usage

drafts=$([ "$1" ]&& printf "$1"|| printf 'drafts')

ls $drafts|while read d; do
  if [ -f "$drafts/$d" ]; then
    #sed -i 's/^date:/published_date:/' drafts/$d
    # 2012-05-06T02:00:00.000+01:00
    sed -i 's/date: \([[:digit:]]*-[[:digit:]]*-[[:digit:]]*\)T\([^\.]*\).*\(+[[:digit:]]*\):\([[:digit:]]*\)/date: \1 \2 \3\4/' $drafts/$d
    sed -i 's/updated: \([[:digit:]]*-[[:digit:]]*-[[:digit:]]*\)T\([^\.]*\).*\(+[[:digit:]]*\):\([[:digit:]]*\)/updated: \1 \2 \3\4/' $drafts/$d
    # 2013-03-01T18:11:00.000Z
    sed -i 's/date: \([[:digit:]]*-[[:digit:]]*-[[:digit:]]*\)T\([^\.]*\).*Z/date: \1 \2 +0000/' $drafts/$d
    sed -i 's/updated: \([[:digit:]]*-[[:digit:]]*-[[:digit:]]*\)T\([^\.]*\).*Z/updated: \1 \2 +0000/' $drafts/$d
    #sed -i 's/^url:/permalink:/' drafts/$d
    #sed -i 's/^draft:/is_draft:/' drafts/$d
  else
    echo "[w] $d not found in drafts/"
  fi
done
