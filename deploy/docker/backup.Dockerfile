# Zálohovací kontejner: pg_dump + restic (šifrovaně do S3 kompatibilního úložiště). Staví se v CI.
FROM alpine:3.22
RUN apk add --no-cache restic postgresql17-client bash curl tzdata util-linux jq coreutils
COPY deploy/scripts/backup-tool.sh /scripts/backup-tool.sh
# uid/gid 1000 jako uživatel `node` v obrazu aplikace, aby si sdílený svazek se stavem zálohy mohly číst obě strany
RUN chmod 0755 /scripts/backup-tool.sh && addgroup -g 1000 -S backup && adduser -u 1000 -G backup -S backup \
    && mkdir -p /work /data/status && chown -R backup:backup /work /data/status
USER backup
ENTRYPOINT ["/scripts/backup-tool.sh"]
CMD ["loop"]
