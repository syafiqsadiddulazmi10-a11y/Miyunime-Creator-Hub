# Dockerfile di ROOT repo untuk Fly.io. Aplikasi ada di subfolder miyunime-creator-hub/.
FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_FILE=/data/miyunime.db
WORKDIR /app
COPY miyunime-creator-hub/package.json ./
COPY miyunime-creator-hub/src ./src
COPY miyunime-creator-hub/public ./public
# Volume Fly di-mount sebagai root, jadi proses berjalan sebagai root agar SQLite bisa menulis ke /data.
# (Mesin Fly adalah VM terisolasi per aplikasi.)
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "src/server-main.ts"]
