# Tiny image: just Node serving static files. No build step, no deps.
FROM node:20-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server.js"]
