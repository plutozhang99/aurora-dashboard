"""SPA static serving + path-traversal containment (security regression).

Guards the fix for the SPA fallback that previously joined the request path onto
dist/ with no containment check, allowing ``GET /%2e%2e/etc/passwd`` to read
arbitrary files. ``safe_static_file`` must confine every path to dist_root.
"""

from __future__ import annotations

from app.main import safe_static_file


def _make_dist(tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>app</html>")
    (dist / "app.js").write_text("console.log(1)")
    (dist / "assets" / "x.css").write_text("body{}")
    # A secret sitting OUTSIDE dist that traversal would try to reach.
    (tmp_path / "secret.txt").write_text("TOPSECRET")
    return dist.resolve()


def test_serves_real_files_within_dist(tmp_path):
    dist_root = _make_dist(tmp_path)
    assert safe_static_file(dist_root, "app.js") == dist_root / "app.js"
    assert safe_static_file(dist_root, "assets/x.css") == dist_root / "assets" / "x.css"


def test_empty_or_missing_path_returns_none(tmp_path):
    dist_root = _make_dist(tmp_path)
    assert safe_static_file(dist_root, "") is None
    assert safe_static_file(dist_root, "spa/route/that/does/not/exist") is None


def test_traversal_is_blocked(tmp_path):
    dist_root = _make_dist(tmp_path)
    # Decoded forms of %2e%2e / ..%2f / raw .. that the router passes through.
    for attack in (
        "../secret.txt",
        "../../secret.txt",
        "../../../../../../etc/passwd",
        "..",
    ):
        assert safe_static_file(dist_root, attack) is None, attack
