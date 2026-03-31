FROM node:18-alpine
WORKDIR /app
RUN npm init -y && npm install ws
COPY index.js .
CMD ["node", "index.js"]
