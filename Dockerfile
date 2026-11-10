# Build stage: generate the site and copy only public files into dist/
FROM python:3.12-alpine AS build
# Coolify build variable: production (main, getfitdaily.co.za) or dev (dev branch, dev.getfitdaily.co.za).
# It picks the Supabase project from deploy/supabase.json. SUPABASE_URL / SUPABASE_KEY override it if set.
ARG GFD_ENV=production
ARG SUPABASE_URL=
ARG SUPABASE_KEY=
WORKDIR /app
COPY . .
RUN python3 tools/build_pages.py \
 && GFD_ENV="$GFD_ENV" SUPABASE_URL="$SUPABASE_URL" SUPABASE_KEY="$SUPABASE_KEY" python3 tools/build_dist.py

# Serve stage: plain nginx with only dist/
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
RUN nginx -t
EXPOSE 80
