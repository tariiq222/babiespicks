function retired() { return Response.json({ message: 'Management has moved to the authenticated MCP service' }, { status: 410 }); }
export { retired as GET, retired as POST, retired as PUT, retired as PATCH, retired as DELETE, retired as OPTIONS };
