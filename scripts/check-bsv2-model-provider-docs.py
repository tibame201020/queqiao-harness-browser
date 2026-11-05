#!/usr/bin/env python3
"""Check BSV2 model-provider documentation contract (design only).

No network, browser profile, user data or model credentials are read.
Run: python scripts/check-bsv2-model-provider-docs.py
Dependency: PyYAML 6.x
"""

from pathlib import Path
import re

import yaml


ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs" / "browser-service-v2"


def require(condition: bool, description: str) -> None:
    if not condition:
        raise AssertionError(description)


def resolve_ref(document: dict, ref: str) -> object:
    require(ref.startswith("#/"), f"non-local OpenAPI ref: {ref}")
    node: object = document
    for token in ref[2:].split("/"):
        token = token.replace("~1", "/").replace("~0", "~")
        require(isinstance(node, dict) and token in node, f"broken OpenAPI ref {ref}")
        node = node[token]
    return node


def walk_refs(document: dict, node: object) -> None:
    if isinstance(node, dict):
        if "$ref" in node:
            require(isinstance(node["$ref"], str), "$ref must be a string")
            resolve_ref(document, node["$ref"])
        for value in node.values():
            walk_refs(document, value)
    elif isinstance(node, list):
        for value in node:
            walk_refs(document, value)


def check() -> None:
    openapi = yaml.safe_load((DOC / "OPENAPI.yaml").read_text(encoding="utf-8"))
    require(isinstance(openapi, dict), "OpenAPI must be an object")
    require(str(openapi.get("openapi", "")).startswith("3.1."), "OpenAPI must be 3.1")
    paths = openapi.get("paths", {})
    require(
        set(paths) == {"/health", "/v1/models", "/v1/chat/completions"},
        f"model API routes drifted: {sorted(paths)}",
    )
    require("post" in paths["/v1/chat/completions"], "missing POST chat completions")
    require("get" in paths["/v1/models"], "missing GET models")
    require("get" in paths["/health"], "missing GET health")

    post = paths["/v1/chat/completions"]["post"]
    require(
        post["responses"]["200"]["content"].keys()
        >= {"application/json", "text/event-stream"},
        "must support both JSON and streaming model responses",
    )
    require(
        any(
            p["name"] == "Idempotency-Key" and p.get("required") is False
            for p in post.get("parameters", [])
        ),
        "Idempotency-Key must be optional for drop-in providers",
    )

    schemas = openapi["components"]["schemas"]
    req = schemas["CompletionRequest"]
    require({"model", "messages", "tools", "stream"} <= req["properties"].keys(), "missing model request contract")
    require("tool_calls" in schemas["AssistantMessage"]["properties"], "missing assistant tool calls")
    require({"tool_call_id", "content"} <= set(schemas["ToolMessage"]["required"]), "missing tool result identity")
    choice = schemas["CompletionResponse"]["properties"]["choices"]["items"]
    require("tool_calls" in choice["properties"]["finish_reason"]["enum"], "missing tool_calls finish reason")
    require("usage" not in schemas["CompletionResponse"]["required"], "usage cannot be invented")
    walk_refs(openapi, openapi)

    spec = (DOC / "SPEC.md").read_text(encoding="utf-8")
    tickets = (DOC / "TICKETS.md").read_text(encoding="utf-8")
    readme = (DOC / "README.md").read_text(encoding="utf-8")
    adr = (DOC / "ADR-0001.md").read_text(encoding="utf-8")
    review = (DOC / "REVIEW-GATES.md").read_text(encoding="utf-8")

    for filename, contents in [("SPEC", spec), ("TICKETS", tickets), ("README", readme), ("ADR", adr), ("REVIEW", review)]:
        require("model" in contents.lower(), f"{filename} missing model-provider goal")
        require("tool" in contents.lower(), f"{filename} missing tool-calling feasibility")

    require("models.json" in tickets and "models.json" in readme, "Pi provider config must be tested")
    require('"api": "openai-completions"' in readme, "Pi must choose supported API without an extension")
    require("BSV2-001" in tickets and "feasibility" in tickets.lower(), "missing feasibility gate")
    require("BLOCKED" in tickets and "BLOCKED" in spec, "unproven capability must block parity claim")

    ids = {f"BSV2-{i:03d}" for i in range(1, 12)}
    require(ids <= set(re.findall(r"BSV2-\d{3}", tickets)), "missing planned ticket")
    for file in DOC.glob("*.md"):
        content = file.read_text(encoding="utf-8")
        for target in re.findall(r"\[[^]]+\]\(([^)]+)\)", content):
            if target.startswith(("http://", "https://", "#")):
                continue
            require((file.parent / target.split("#", 1)[0]).exists(), f"{file.name} broken link: {target}")

    print("PASS BSV2 OpenAPI 3.1 syntax, references, model API routes, tool wire, ticket and docs consistency")


if __name__ == "__main__":
    check()
