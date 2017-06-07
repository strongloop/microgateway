FROM nginx

ADD nginx.tmpl /etc/nginx/
ADD run.sh /

RUN chmod +x /run.sh

RUN apt-get update; apt-get install -y \
    openssl
	
CMD /run.sh
