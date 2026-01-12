import got from 'got'
import { PromotionsSlim } from '../model/forge/PromotionsSlim.js'
import { MinecraftVersion } from './MinecraftVersion.js'
import { LoggerUtil } from './LoggerUtil.js'
import { FabricInstallerMeta, FabricLoaderMeta, FabricProfileJson, FabricVersionMeta } from '../model/fabric/FabricMeta.js'
import { NeoForgeVersionIndex } from '../model/neoforge/NeoForgeVersionIndex.js'

export class VersionUtil {

    private static readonly logger = LoggerUtil.getLogger('VersionUtil')

    public static readonly PROMOTION_TYPE = [
        'recommended',
        'latest'
    ]

    public static isVersionAcceptable(version: MinecraftVersion, acceptable: number[]): boolean {
        if (version.getMajor() === 1) {
            return acceptable.find((element) => version.getMinor() === element) != null
        }
        return false
    }

    public static versionGte(version: string, min: string): boolean {

        if(version === min) {
            return true
        }

        const left = version.split('.').map(x => Number(x))
        const right = min.split('.').map(x => Number(x))

        if(left.length != right.length) {
            throw new Error('Cannot compare mismatched versions.')
        }

        for(let i=0; i<left.length; i++) {
            if(left[i] > right[i]) {
                return true
            }
        }

        return false
    }

    public static isPromotionVersion(version: string): boolean {
        return VersionUtil.PROMOTION_TYPE.includes(version.toLowerCase())
    }

    // -------------------------------
    // Forge

    public static isOneDotTwelveFG2(libraryVersion: string): boolean {
        const maxFG2 = [14, 23, 5, 2847]
        const verSplit = libraryVersion.split('.').map(v => Number(v))

        for(let i=0; i<maxFG2.length; i++) {
            if(verSplit[i] > maxFG2[i]) {
                return false
            }
        }
        
        return true
    }

    public static async getPromotionIndex(): Promise<PromotionsSlim> {
        const response = await got.get<PromotionsSlim>({
            method: 'get',
            url: 'https://files.minecraftforge.net/maven/net/minecraftforge/forge/promotions_slim.json',
            responseType: 'json'
        })
        return response.body
    }

    public static async getNeoForgeVersionIndex(): Promise<NeoForgeVersionIndex> {
        const response = await got.get<NeoForgeVersionIndex>({
            method: 'get',
            url: 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge',
            responseType: 'json'
        })
        return response.body
    }

    public static getPromotedVersionStrict(index: PromotionsSlim, minecraftVersion: MinecraftVersion, promotion: string): string {
        const workingPromotion = promotion.toLowerCase()
        return index.promos[`${minecraftVersion}-${workingPromotion}`]
    }

    public static async getPromotedForgeVersion(minecraftVersion: MinecraftVersion, promotion: string): Promise<string> {
        const workingPromotion = promotion.toLowerCase()
        const res = await VersionUtil.getPromotionIndex()
        let version = res.promos[`${minecraftVersion}-${workingPromotion}`]
        if (version == null) {
            VersionUtil.logger.warn(`No ${workingPromotion} version found for Forge ${minecraftVersion}.`)
            VersionUtil.logger.warn('Attempting to pull latest version instead.')
            version = res.promos[`${minecraftVersion}-latest`]
            if (version == null) {
                throw new Error(`No latest version found for Forge ${minecraftVersion}.`)
            }
        }
        return version
    }

    // -------------------------------
    // NeoForge

    public static async getPromotedNeoForgeVersion(minecraftVersion: MinecraftVersion, promotion: string): Promise<string> {
        const stable = promotion.toLowerCase() === 'recommended'
        const index = await VersionUtil.getNeoForgeVersionIndex()

        let version: string | undefined = VersionUtil.findNeoForgePromotedVersion(index, stable, minecraftVersion)
        if (version == null) {
            VersionUtil.logger.warn(`No ${promotion.toLowerCase()} version found for NeoForge ${minecraftVersion}.`)
            VersionUtil.logger.warn('Attempting to pull latest version instead.')
            version = VersionUtil.findNeoForgePromotedVersion(index, false, minecraftVersion)
            if (version == null) {
                throw new Error(`No latest version found for Forge ${minecraftVersion}.`)
            }
        }

        return version
    }

    public static findNeoForgePromotedVersion(index: NeoForgeVersionIndex, stable: boolean, workingVersion: MinecraftVersion): string | undefined {
        // Expects to receive the incoming version index, with the latest version further in the array.
        let latestAvailable: string | undefined

        const minecraftMinor = workingVersion.getMinor()
        const minecraftPatch = workingVersion.getRevision() ?? 0

        index.versions.filter(version => {
            const vSplit = version.split('.')
            if (vSplit.length < 2) return false

            const neoMajor = parseInt(vSplit[0])
            const neoMinor = parseInt(vSplit[1])
            return neoMajor === minecraftMinor && neoMinor === minecraftPatch
        }).forEach(version => {
            if (stable) {
                if (!version.endsWith('-beta'))
                    latestAvailable = version

                return
            }

            latestAvailable = version
        })

        return latestAvailable
    }

    // -------------------------------
    // Fabric

    public static async getFabricInstallerMeta(): Promise<FabricInstallerMeta[]> {
        const response = await got.get<FabricInstallerMeta[]>({
            method: 'get',
            url: 'https://meta.fabricmc.net/v2/versions/installer',
            responseType: 'json'
        })
        return response.body
    }

    public static async getFabricLoaderMeta(): Promise<FabricLoaderMeta[]> {
        const response = await got.get<FabricLoaderMeta[]>({
            method: 'get',
            url: 'https://meta.fabricmc.net/v2/versions/loader',
            responseType: 'json'
        })
        return response.body
    }

    public static async getFabricGameMeta(): Promise<FabricVersionMeta[]> {
        const response = await got.get<FabricVersionMeta[]>({
            method: 'get',
            url: 'https://meta.fabricmc.net/v2/versions/game',
            responseType: 'json'
        })
        return response.body
    }

    public static async getFabricProfileJson(gameVersion: string, loaderVersion: string): Promise<FabricProfileJson> {
        const response = await got.get<FabricProfileJson>({
            method: 'get',
            url: `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${loaderVersion}/profile/json`,
            responseType: 'json'
        })
        return response.body
    }

    public static async getPromotedFabricVersion(promotion: string): Promise<string> {
        const stable = promotion.toLowerCase() === 'recommended'
        const fabricLoaderMeta = await this.getFabricLoaderMeta()
        return !stable ? fabricLoaderMeta[0].version : fabricLoaderMeta.find(({ stable }) => stable)!.version
    }

}
