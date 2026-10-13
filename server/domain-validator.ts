import dns from 'dns';
import { promisify } from 'util';

const dnsResolve = promisify(dns.resolve);

export async function validateDomainExists(domain: string): Promise<boolean> {
  try {
    const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    await dnsResolve(cleanDomain);
    return true;
  } catch (error: any) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return false;
    }
    return true;
  }
}

export async function filterValidCompetitors(competitors: string[]): Promise<{
  valid: string[];
  invalid: string[];
}> {
  const results = await Promise.all(
    competitors.map(async (competitor) => {
      const exists = await validateDomainExists(competitor);
      return { competitor, exists };
    })
  );
  
  return {
    valid: results.filter(r => r.exists).map(r => r.competitor),
    invalid: results.filter(r => !r.exists).map(r => r.competitor)
  };
}
