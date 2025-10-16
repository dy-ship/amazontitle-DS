FROM node:20
WORKDIR /app
COPY . .
RUN npm install --legacy-peer-deps
RUN npm --prefix client install && npm --prefix client run build
EXPOSE 3000
CMD ["node", "server/server.js"]
