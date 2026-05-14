FROM node:20-slim
WORKDIR /app
COPY gateway/nodejs/package.json .
RUN npm install
COPY gateway/nodejs .
CMD ["npm", "start"]
