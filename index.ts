


// curl -H "Content-Type:application/json" -X POST -d "{\"token\":\"${{inputs.BONK_TOKEN}}\", \"gh_run_id\":\"${{github.run_id}}\" }" ${{inputs.BONK_PUBLIC_URL}}/api/link-github-run

import * as github from "@actions/github"
import * as core from "@actions/core"
import * as fs from "fs"
import fetch from "node-fetch"

const { execSync } = require("child_process")
const { resolve } = require("path")

async function main() {
    const BONK_PUBLIC_URL = core.getInput("BONK_PUBLIC_URL")
    const BONK_TOKEN = core.getInput("BONK_TOKEN")

    core.info(`Sending request to link github run '${github.context.runId}' to '${BONK_PUBLIC_URL}'`)

    const linkRequest = await fetch(BONK_PUBLIC_URL + "/api/link-github-run", { 
        method: "POST",
        body: JSON.stringify({
            token: BONK_TOKEN,
            gh_run_id: github.context.runId
        }),
        headers: {
            "Content-Type": "application/json",
        }
    })

    const bonkMeta = await linkRequest.json()    

    core.info(`Linked run to workgroup '${bonkMeta.workgroup_run._id}'`)

    const unit = bonkMeta.workgroup_run.items[bonkMeta.unit]
    const GITHUB_TOKEN = core.getInput("GITHUB_TOKEN")
    const octokit = github.getOctokit(GITHUB_TOKEN)

    let _promises = unit.inputs.map(async (input: any) => {
        if (input.type !== "artifact") return;

        core.info(`Downloading artifact '${input.name}' from work unit '${input.producer}'`)

        const producerRun = bonkMeta.workgroup_run.items[input.producer]
        const artifacts = await octokit.request("GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts", {
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            run_id: producerRun.gh_run_id,
        })

        const artifactId = artifacts.data.artifacts.find(a => a.name == input.name)
        if (!artifactId) throw new Error(`No artifact with name '${input.name}' in workflow run '${producerRun.gh_run_id}'`)

        console.info(`Found artifact '${input.name}' with id '${artifactId}'`)

        const artUrl = await octokit.request("GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}", {
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            artifact_id: artifactId.id,
            archive_format: "zip",
        })

        console.info(`Retrieved artifact download URL: '${artUrl.headers.location}'`)

        const downloadPath = resolve(input.downloadPath, "/__gh_artifact_download")
        const file = fs.createWriteStream(downloadPath);
        const fdata = await (await fetch(artUrl.headers.location!)).buffer()
        fs.writeFile(downloadPath, fdata, (err => {
            if (err) throw new Error(err.message)

            execSync("unzip " + downloadPath, { stdio: "inherit" })
            fs.rmSync(downloadPath)
            core.info(`Finished downloading artifact '${input.name}'`)
        }))
    })

    await Promise.all(_promises)
}

async function __main() {
    try {
        await main()
    } catch (e) {
        core.setFailed(e.message)
    }
}

__main()