name: Send release notifications
on:
  release:
    types: [published]

jobs:
  send-notification:
    runs-on: ubuntu-latest
    steps:
      - name: Post to a Slack channel
        id: slack
        uses: slackapi/slack-github-action@v1.23.0
        with:
          channel-id: "releases"
          payload: |
            {
              "blocks":[
                {
                  "type": "header",
                  "text":  {
                    "type": "plain_text",
                    "text": "${{ github.event.release.tag_name}} is out!"
                  }
                },
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Release details*"
                  }
                },
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": ${{ toJSON(github.event.release.body) }}
                  }
                },
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "${{ github.event.release.html_url }}"
                  }
                }
              ]
            }
        env:
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
