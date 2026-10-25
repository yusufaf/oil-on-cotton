FROM node:24-alpine
WORKDIR /app
COPY package.json key.ts directory.ts server.ts about.html ./
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.ts"]
