// Star layout (d3-force), shared by the sky page and its background worker.
// nodes: [{ c: isCenter, x, y }], links: [[sourceIndex, targetIndex]], P: layoutParams(). Returns [[x, y], ...].
// d3's simulation is deterministic, so the same stars always land in the same places.
self.birLayout = function (d3, P, nodes, links) {
  const ns = nodes.map(n => n.c ? { c: true, x: 0, y: 0, fx: 0, fy: 0 } : { c: false, x: n.x, y: n.y });
  const ls = links.map(([s, t]) => ({ source: ns[s], target: ns[t] }));
  const sim = d3.forceSimulation(ns)
    .force('link', d3.forceLink(ls).distance(l => l.target.c ? P.linkCenter : P.link).strength(.55))
    .force('charge', d3.forceManyBody().strength(d => d.c ? P.chargeCenter : P.charge).distanceMax(P.distMax))
    .force('x', d3.forceX(0).strength(.03))
    .force('y', d3.forceY(0).strength(.03))
    .force('collide', d3.forceCollide(d => d.c ? P.collideCenter : P.collide))
    .stop();
  for (let i = 0; i < 500; i++) sim.tick();
  return ns.map(n => [n.x, n.y]);
};
