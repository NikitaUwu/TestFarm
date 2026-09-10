"""TLS CONNECT tunnel: the runner can only reach Groq's API on port 443."""
import asyncio


async def handle(reader, writer):
    upstream=None
    try:
        header=await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'),5)
        if len(header)>8192 or header.split(b'\r\n',1)[0] != b'CONNECT api.groq.com:443 HTTP/1.1':
            writer.write(b'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n'); await writer.drain(); return
        remote,upstream=await asyncio.wait_for(asyncio.open_connection('api.groq.com',443),10)
        writer.write(b'HTTP/1.1 200 Connection Established\r\n\r\n'); await writer.drain()
        async def transfer(source,target):
            while data:=await source.read(65536):
                target.write(data); await target.drain()
        tasks=[asyncio.create_task(transfer(reader,upstream)),asyncio.create_task(transfer(remote,writer))]
        try: await asyncio.wait(tasks,timeout=180,return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in tasks: task.cancel()
            await asyncio.gather(*tasks,return_exceptions=True)
    except (Exception,asyncio.CancelledError): pass
    finally:
        if upstream: upstream.close()
        writer.close()


async def main():
    server=await asyncio.start_server(handle,'0.0.0.0',8080,limit=8192)
    async with server: await server.serve_forever()


if __name__=='__main__':asyncio.run(main())
