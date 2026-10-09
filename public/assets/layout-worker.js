// Runs the star layout off the main thread, so the arrival animation never stalls.
importScripts('/assets/vendor/d3.min.js', '/assets/layout.js');
onmessage = e => {
  const { id, P, nodes, links } = e.data;
  postMessage({ id, pos: self.birLayout(self.d3, P, nodes, links) });
};
