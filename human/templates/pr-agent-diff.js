(() => {
  const root = document.querySelector("#step-diff");
  if (!root) return;

  root.querySelectorAll("pre > code").forEach((code) => {
    const lines = code.textContent.split("\n");
    const pre = code.parentElement;
    if (!pre) return;

    pre.classList.add("diff-rendered");
    code.replaceChildren(
      ...lines.map((line) => {
        const row = document.createElement("span");
        row.className = "diff-line";

        const hasDiffPrefix = /^[ +\-@]/.test(line);
        const prefix = hasDiffPrefix ? (line[0] ?? " ") : " ";
        const content = hasDiffPrefix ? line.slice(1) : line;
        const prefixElement = document.createElement("span");
        prefixElement.className = "diff-line-prefix";
        prefixElement.textContent = prefix;
        row.append(prefixElement, document.createTextNode(content));

        if (line.startsWith("@@")) row.classList.add("diff-line-hunk");
        else if (line.startsWith("+++") || line.startsWith("---")) {
          row.classList.add("diff-line-file");
        } else if (line.startsWith("+")) row.classList.add("diff-line-add");
        else if (line.startsWith("-")) row.classList.add("diff-line-delete");

        return row;
      }),
    );
  });
})();
