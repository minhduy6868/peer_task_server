export default {
  async fetch(request) {
    const target = new URL(request.url);
    target.protocol = "http:";
    target.hostname = "ec2-47-129-174-108.ap-southeast-1.compute.amazonaws.com";
    target.port = "3000";

    // Pass the original request through so WebSocket upgrades reach Socket.IO.
    return fetch(target, request);
  },
};
