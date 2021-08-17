


// curl -H "Content-Type:application/json" -X POST -d "{\"token\":\"${{inputs.BONK_TOKEN}}\", \"gh_run_id\":\"${{github.run_id}}\" }" ${{inputs.BONK_PUBLIC_URL}}/api/link-github-run

const fetch = require("node-fetch")
const core = require("@actions/core")
const github = require("@actions/github")
const https = require("https")
const fs = require("fs")

const { execSync } = require("child_process")
const { resolve } = require("path")

try {
    const BONK_PUBLIC_URL = core.getInput("BONK_PUBLIC_URL")
    const BONK_TOKEN = core.getInput("BONK_TOKEN")

    const bonkMeta = await (await fetch(BONK_PUBLIC_URL + "/api/link-github-run", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: {
            token: BONK_TOKEN,
            gh_run_id: github.context.runId,
        }
    })).json()

    core.info(JSON.stringify(bonkMeta))

    const unit = bonkMeta.workgroup_run.items[bonkMeta.unit]
    
    unit.inputs.forEach(input => {
        if (input.type !== "artifact") return;

        const producerRun = bonkMeta.workgroup_run.items[input.producer]
        const artifacts = await github.getOctokit().request("GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts", {
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            run_id: producerRun.gh_run_id,
        })

        const artifactId = artifacts.data.artifacts.find(a => a.name == input.name)
        if (!artifactId) throw new Error(`No artifact with name '${input.name}' in workflow run '${producer.gh_run_id}'`)

        const artUrl = await github.getOctokit().request("GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}", {
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            artifact_id,
            archive_format: "zip",
        })

        const downloadPath = resolve(input.downloadPath, "/__gh_artifact_download")
        const file = fs.createWriteStream(downloadPath)
        https.get(artUrl.headers.location, response => {
            response.pipe(file)
            file.on("finish", () => {
                file.close(() => {
                    execSync("unzip " + downloadPath, { stdio: "inherit"})
                    fs.rmSync(downloadPath)
                })
            })
        })
    })


} catch(error) {
    core.setFailed(error.message)
}
