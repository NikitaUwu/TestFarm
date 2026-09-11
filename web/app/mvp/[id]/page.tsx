import MvpRenderer from '../../../components/MvpRenderer';
export default async function Page({params}:{params:Promise<{id:string}>}){return <MvpRenderer id={(await params).id}/>;}
