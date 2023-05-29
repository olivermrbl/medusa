import * as core from "@actions/core"
import * as github from "@actions/github"
import { execSync } from "child_process"

const createCatFile = ({ email, api_key }) => `cat >~/.netrc <<EOF
machine api.heroku.com
    login ${email}
    password ${api_key}
machine git.heroku.com
    login ${email}
    password ${api_key}
EOF`

// Input Variables
const heroku = {
  api_key: core.getInput("heroku_api_key"),
  email: core.getInput("heroku_email"),
  app_name: core.getInput("heroku_app_name"),
}

;(async () => {
  if (github.event.pull_request.merged == true) {
    try {
      execSync(createCatFile(heroku))
      console.log("Created and wrote to ~/.netrc")
      console.log("Successfully logged into heroku")

      execSync("heroku apps:destroy --app " + heroku.app_name)

      core.setOutput(
        "status",
        "Successfully destroyed Heroku app: " + heroku.app_name
      )
    } catch (err) {
      console.error(`
              Unable to destroy app.
              Specifically, the error was: ${err}
          `)

      core.setFailed(err.toString())
    }
  }
})()
