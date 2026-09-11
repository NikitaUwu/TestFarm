import SharedReport from '../../../components/SharedReport';
export default async function Page({params}:{params:Promise<{token:string}>}){return <SharedReport token={(await params).token}/>;}
