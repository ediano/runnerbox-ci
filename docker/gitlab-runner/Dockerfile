FROM gitlab/gitlab-runner:latest

COPY entrypoint.sh /runnerbox-entrypoint.sh
RUN chmod +x /runnerbox-entrypoint.sh

ENTRYPOINT ["/runnerbox-entrypoint.sh"]
