import net from 'node:net'

/** True als er op deze poort niets luistert (IPv4 én IPv6). */
function isFree(port: number, host: string): Promise<boolean> {
    return new Promise(resolve => {
        const server = net.createServer()
        server.once('error', (err: NodeJS.ErrnoException) => {
            // Geen IPv6 op deze machine telt niet als "bezet".
            resolve(err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT')
        })
        server.once('listening', () => server.close(() => resolve(true)))
        server.listen(port, host)
    })
}

/** Eerste vrije poort vanaf `start`. */
export async function findFreePort(start: number): Promise<number> {
    for (let port = start; port < start + 100; port++) {
        if ((await isFree(port, '0.0.0.0')) && (await isFree(port, '::'))) return port
    }
    return start
}
