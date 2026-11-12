# Image produksi. Tidak ada dependensi npm, jadi tidak ada langkah "npm install".
FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_FILE=/app/data/miyunime.db
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
# Folder data harus dimiliki user non-root agar SQLite bisa menulis; pasang sebagai volume agar data tidak hilang.
RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server-main.ts"]
