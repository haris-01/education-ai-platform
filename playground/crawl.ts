import {crawl} from '../apps/worker/src/jobs/cambridge/crawl'


const main = async ()=>{
    const resuts = await crawl('https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-physics-0625/past-papers/')
    console.log(resuts)
}

main().catch(error=>console.log(error))