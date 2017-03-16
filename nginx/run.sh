#!/bin/bash -ex

cp -f /etc/nginx/nginx.tmpl /etc/nginx/nginx.conf
sed -i -e "s/GATEWAY/${GATEWAY_DNS}/g" /etc/nginx/nginx.conf

if [ ! -e "/etc/nginx/cert.pem" || ! -e "/etc/nginx/key.pem" ]
then
    openssl req -x509 -newkey rsa:2048 -days 3650 -nodes -sha256 \
     -keyout "/etc/nginx/key.pem" -out "/etc/nginx/cert.pem" \
     -subj "/C=NN/ST=NN/L=NN/O=NN/CN=localhost"
fi

exec nginx -g "daemon off;"
