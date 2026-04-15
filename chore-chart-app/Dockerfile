# Family Chore Chart - static site served by nginx
FROM nginx:1.27-alpine

# Drop the default nginx site and install ours
RUN rm -rf /usr/share/nginx/html/*
COPY index.html style.css app.js /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Run as an unprivileged user for better compatibility with locked-down clusters
RUN chown -R nginx:nginx /usr/share/nginx/html \
  && chmod -R a+r /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
