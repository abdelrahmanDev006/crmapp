FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY scripts ./scripts

EXPOSE 5000

CMD ["sh", "-c", "npm run db:migrate:deploy && if [ -n \"$BOOTSTRAP_ADMIN_NAME\" ] && [ -n \"$BOOTSTRAP_ADMIN_EMAIL\" ] && [ -n \"$BOOTSTRAP_ADMIN_PASSWORD\" ]; then npm run admin:bootstrap -- --name \"$BOOTSTRAP_ADMIN_NAME\" --email \"$BOOTSTRAP_ADMIN_EMAIL\" --password \"$BOOTSTRAP_ADMIN_PASSWORD\"; fi && npm start"]
