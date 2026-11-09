# Build stage: generate the site and copy only public files into dist/
FROM python:3.12-alpine AS build
ARG SUPABASE_URL
ARG SUPABASE_KEY
WORKDIR /app
COPY . .
RUN test -n "$SUPABASE_URL" && test -n "$SUPABASE_KEY" \
 && python3 tools/build_pages.py \
 && python3 tools/build_dist.py \
 && find dist \( -name '*.html' -o -name '*.js' \) -exec sed -i -E \
      "s#https://zdllpjrkwcdmcuizxuum\.supabase\.co#${SUPABASE_URL}#g; s#sb_publishable_[A-Za-z0-9_-]+#${SUPABASE_KEY}#g" {} + \
 && grep -rqF "$SUPABASE_URL" dist \
 && echo "Supabase set to $SUPABASE_URL"

# Serve stage: plain nginx with only dist/
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
RUN nginx -t
EXPOSE 80
