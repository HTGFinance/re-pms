'use client';
import { Header } from '@/components/Shell';
import { Err, useLoad } from '@/components/ui';
import { api } from '@/lib/api';

export default function Audit() {
  const A = useLoad(() => api<any[]>('/audit?limit=300'));
  return <>
    <Header title="Audit log" sub="Every change made in the system: who, when and what" />
    <div id="view"><Err msg={A.error} />
      <div className="card tw"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Path</th><th className="n">Result</th><th>Details</th></tr></thead>
        <tbody>{A.data?.map((a) => <tr key={a.id}><td style={{ whiteSpace: 'nowrap' }}>{new Date(a.at).toLocaleString('en-GB', { timeZone: 'Asia/Muscat' })}</td><td>{a.userEmail}</td><td>{a.method}</td><td>{a.path.replace(/^\/api/, '')}</td>
          <td className="n"><span className={`pill ${a.statusCode < 300 ? 'p-green' : a.statusCode < 500 ? 'p-amber' : 'p-red'}`}>{a.statusCode}</span></td>
          <td className="small muted" style={{ maxWidth: 380, wordBreak: 'break-word' }}>{a.body ? JSON.stringify(a.body).slice(0, 240) : ''}</td></tr>)}</tbody></table></div>
    </div>
  </>;
}
