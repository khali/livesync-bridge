FROM denoland/deno:2.3.1

WORKDIR /app

VOLUME /app/dat
VOLUME /app/data

COPY . .

RUN deno install --allow-import

# Make Deno cache writable for non-root user (bridge runs as khali uid 1001)
RUN chmod -R a+rwX /deno-dir/

CMD [ "deno", "run", "-A", "main.ts" ]

